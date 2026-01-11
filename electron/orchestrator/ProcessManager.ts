import { existsSync, mkdirSync, createWriteStream, WriteStream } from 'fs'
import { join } from 'path'
import { BrowserWindow } from 'electron'
import { getStateManager } from './StateManager'
import * as pty from 'node-pty'

export interface ClaudeProcessConfig {
  projectId: string
  taskId: string
  prompt: string
  workingDirectory: string
  logFilePath: string
}

export interface ClaudeProcess {
  id: string
  projectId: string
  taskId: string
  ptyProcess: pty.IPty
  logStream: WriteStream
  output: string
  startTime: Date
  status: 'running' | 'completed' | 'failed' | 'stopped'
}

export interface ProcessResult {
  success: boolean
  output: string
  taskComplete: boolean
  taskBlocked: boolean
  blockedReason?: string
}

class ProcessManager {
  private processes: Map<string, ClaudeProcess> = new Map()
  private logsPath: string
  private claudeExecutable: string

  constructor() {
    const stateManager = getStateManager()
    const paths = stateManager.getDataPaths()
    this.logsPath = paths.logs
    this.claudeExecutable = stateManager.getSettings().claudeExecutable || 'claude'

    // Ensure logs directory exists
    if (!existsSync(this.logsPath)) {
      mkdirSync(this.logsPath, { recursive: true })
    }
  }

  /**
   * Generate a unique process ID
   */
  private generateProcessId(projectId: string, taskId: string): string {
    return `${projectId}-${taskId}-${Date.now()}`
  }

  /**
   * Get log directory for a project
   */
  private getProjectLogsDir(projectId: string): string {
    const dir = join(this.logsPath, projectId)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    return dir
  }

  /**
   * Generate log file path for a task execution
   */
  getLogFilePath(projectId: string, taskId: string): string {
    const logsDir = this.getProjectLogsDir(projectId)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    return join(logsDir, `${taskId}-${timestamp}.log`)
  }

  /**
   * Start a Claude process for a task
   */
  async startProcess(config: ClaudeProcessConfig): Promise<string> {
    const processId = this.generateProcessId(config.projectId, config.taskId)

    // Create log file stream
    const logStream = createWriteStream(config.logFilePath, { flags: 'a' })
    logStream.write(`=== Claude Process Started ===\n`)
    logStream.write(`Time: ${new Date().toISOString()}\n`)
    logStream.write(`Project: ${config.projectId}\n`)
    logStream.write(`Task: ${config.taskId}\n`)
    logStream.write(`Working Directory: ${config.workingDirectory}\n`)
    logStream.write(`\n=== Prompt ===\n${config.prompt}\n\n`)
    logStream.write(`=== Output ===\n`)

    // Build Claude CLI arguments
    const args = [
      '-p', config.prompt,
      '--permission-mode', 'dontAsk',
      '--allowedTools', 'Read,Write,Edit,Grep,Glob,Bash(git add:*),Bash(git commit:*),Bash(git status),Bash(npm:*),Bash(pnpm:*),Bash(yarn:*),Bash(node:*),Bash(npx:*)',
      '--disallowedTools', 'Bash(git push:*),Bash(gh:*)',
      '--output-format', 'stream-json',
      '--verbose'  // Required for stream-json with -p mode
    ]

    // Use node-pty for proper TTY emulation (required for streaming output)
    const ptyProcess = pty.spawn(this.claudeExecutable, args, {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: config.workingDirectory,
      env: {
        ...process.env,
        // Disable color output for cleaner logs
        NO_COLOR: '1',
        FORCE_COLOR: '0'
      } as { [key: string]: string }
    })

    const claudeProcess: ClaudeProcess = {
      id: processId,
      projectId: config.projectId,
      taskId: config.taskId,
      ptyProcess,
      logStream,
      output: '',
      startTime: new Date(),
      status: 'running'
    }

    this.processes.set(processId, claudeProcess)

    // Handle PTY data (combined stdout/stderr)
    ptyProcess.onData((data: string) => {
      claudeProcess.output += data
      logStream.write(data)

      // Send output to renderer for real-time display
      this.notifyRenderers('log:update', {
        projectId: config.projectId,
        taskId: config.taskId,
        log: data
      })
    })

    // Handle process exit
    ptyProcess.onExit(({ exitCode }) => {
      claudeProcess.status = exitCode === 0 ? 'completed' : 'failed'
      logStream.write(`\n\n=== Process Ended ===\n`)
      logStream.write(`Exit Code: ${exitCode}\n`)
      logStream.write(`Time: ${new Date().toISOString()}\n`)
      logStream.end()
    })

    return processId
  }

  /**
   * Wait for a process to complete and parse the result
   */
  async waitForProcess(processId: string): Promise<ProcessResult> {
    const claudeProcess = this.processes.get(processId)

    if (!claudeProcess) {
      return {
        success: false,
        output: '',
        taskComplete: false,
        taskBlocked: false
      }
    }

    return new Promise((resolve) => {
      if (claudeProcess.status !== 'running') {
        // Already completed
        resolve(this.parseProcessResult(claudeProcess))
        return
      }

      // Listen for PTY exit
      claudeProcess.ptyProcess.onExit(() => {
        resolve(this.parseProcessResult(claudeProcess))
      })
    })
  }

  /**
   * Parse the process output to determine task status
   */
  private parseProcessResult(claudeProcess: ClaudeProcess): ProcessResult {
    const output = claudeProcess.output

    // Check for task completion signals
    const isComplete = output.includes('TASK_COMPLETE') ||
                       output.includes('DONE') ||
                       output.includes('Task completed')

    // Check for blocked signals
    const isBlocked = output.includes('TASK_BLOCKED') ||
                      output.includes('BLOCKED')

    let blockedReason: string | undefined
    if (isBlocked) {
      // Try to extract reason
      const blockMatch = output.match(/TASK_BLOCKED:\s*(.+?)(?:\n|$)/i) ||
                         output.match(/BLOCKED:\s*(.+?)(?:\n|$)/i)
      blockedReason = blockMatch?.[1]?.trim() || 'Unknown reason'
    }

    return {
      success: claudeProcess.status === 'completed',
      output,
      taskComplete: isComplete && !isBlocked,
      taskBlocked: isBlocked,
      blockedReason
    }
  }

  /**
   * Stop a running process
   */
  stopProcess(processId: string): boolean {
    const claudeProcess = this.processes.get(processId)

    if (!claudeProcess || claudeProcess.status !== 'running') {
      return false
    }

    claudeProcess.ptyProcess.kill()
    claudeProcess.status = 'stopped'
    claudeProcess.logStream.write('\n\n=== Process Stopped by User ===\n')
    claudeProcess.logStream.end()

    return true
  }

  /**
   * Stop all processes for a project
   */
  stopProjectProcesses(projectId: string): number {
    let stoppedCount = 0

    for (const [processId, claudeProcess] of this.processes) {
      if (claudeProcess.projectId === projectId && claudeProcess.status === 'running') {
        this.stopProcess(processId)
        stoppedCount++
      }
    }

    return stoppedCount
  }

  /**
   * Get process status
   */
  getProcessStatus(processId: string): ClaudeProcess['status'] | null {
    const claudeProcess = this.processes.get(processId)
    return claudeProcess?.status || null
  }

  /**
   * Get all active processes for a project
   */
  getProjectProcesses(projectId: string): ClaudeProcess[] {
    const result: ClaudeProcess[] = []

    for (const claudeProcess of this.processes.values()) {
      if (claudeProcess.projectId === projectId) {
        result.push(claudeProcess)
      }
    }

    return result
  }

  /**
   * Check if Claude CLI is available
   */
  isClaudeAvailable(): boolean {
    try {
      const { execSync } = require('child_process')
      execSync(`which ${this.claudeExecutable}`, { stdio: 'pipe' })
      return true
    } catch {
      return false
    }
  }

  /**
   * Clean up completed processes older than specified age
   */
  cleanupOldProcesses(maxAgeMs: number = 3600000): void {
    const now = Date.now()

    for (const [processId, claudeProcess] of this.processes) {
      if (
        claudeProcess.status !== 'running' &&
        now - claudeProcess.startTime.getTime() > maxAgeMs
      ) {
        this.processes.delete(processId)
      }
    }
  }

  /**
   * Notify all renderer windows
   */
  private notifyRenderers(channel: string, data: unknown): void {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send(channel, data)
    })
  }
}

// Singleton
let processManager: ProcessManager | null = null

export function getProcessManager(): ProcessManager {
  if (!processManager) {
    processManager = new ProcessManager()
  }
  return processManager
}
