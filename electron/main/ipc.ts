import { ipcMain, app } from 'electron'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { getStateManager } from '../orchestrator/StateManager'
import { getOrchestrator } from '../orchestrator/Orchestrator'
import { getProcessManager } from '../orchestrator/ProcessManager'

// Initialize state manager
const stateManager = getStateManager()

// Path operations
ipcMain.handle('get-paths', () => {
  return stateManager.getDataPaths()
})

ipcMain.handle('get-app-version', () => {
  return app.getVersion()
})

// State operations
ipcMain.handle('state:get', () => {
  return stateManager.getState()
})

ipcMain.handle('state:save', (_event, state) => {
  stateManager.setState(state)
})

// Settings operations
ipcMain.handle('settings:get', () => {
  return stateManager.getSettings()
})

ipcMain.handle('settings:update', (_event, updates) => {
  return stateManager.updateSettings(updates)
})

// Project operations
ipcMain.handle('project:list', () => {
  return stateManager.getProjects()
})

ipcMain.handle('project:get', (_event, id: string) => {
  return stateManager.getProject(id)
})

ipcMain.handle('project:create', (_event, input) => {
  return stateManager.createProject(input)
})

ipcMain.handle('project:update', (_event, id: string, updates) => {
  return stateManager.updateProject(id, updates)
})

ipcMain.handle('project:delete', (_event, id: string) => {
  return stateManager.deleteProject(id)
})

// Task operations
ipcMain.handle('task:list', (_event, projectId: string) => {
  return stateManager.getTasks(projectId)
})

ipcMain.handle('task:get', (_event, projectId: string, taskId: string) => {
  return stateManager.getTask(projectId, taskId)
})

ipcMain.handle('task:create', (_event, projectId: string, input) => {
  return stateManager.createTask(projectId, input)
})

ipcMain.handle('task:update', (_event, projectId: string, taskId: string, updates) => {
  const result = stateManager.updateTask(projectId, taskId, updates)

  // If a task was moved to backlog and project is not running, reset project to idle
  // This allows restarting completed/failed projects by moving tasks back to backlog
  if (updates.status === 'backlog') {
    const project = stateManager.getProject(projectId)
    if (project && project.status !== 'running') {
      const hasBacklogTasks = project.tasks.some((t) => t.status === 'backlog')
      if (hasBacklogTasks) {
        stateManager.updateProject(projectId, { status: 'idle' })
      }
    }
  }

  return result
})

ipcMain.handle('task:delete', (_event, projectId: string, taskId: string) => {
  return stateManager.deleteTask(projectId, taskId)
})

// Log operations
ipcMain.handle('logs:get', (_event, projectId: string, taskId: string) => {
  const task = stateManager.getTask(projectId, taskId)
  if (!task || task.logs.length === 0) return ''

  // Get the most recent log
  const latestLog = task.logs[task.logs.length - 1]
  if (!latestLog.filePath || !existsSync(latestLog.filePath)) {
    return `No log file found. Summary: ${latestLog.summary}`
  }

  try {
    return readFileSync(latestLog.filePath, 'utf-8')
  } catch (error) {
    return `Failed to read log file: ${error}`
  }
})

ipcMain.handle('logs:getAll', (_event, projectId: string, taskId: string) => {
  const task = stateManager.getTask(projectId, taskId)
  return task?.logs || []
})

ipcMain.handle('logs:add', (_event, projectId: string, taskId: string, log) => {
  return stateManager.addTaskLog(projectId, taskId, log)
})

// Loop log operations
ipcMain.handle('project:addLoopLog', (_event, projectId: string, iteration: number, step: string, message: string, taskId?: string, details?: string) => {
  return stateManager.addLoopLog(projectId, iteration, step as 'task_selection' | 'execution' | 'verification' | 'result', message, taskId, details)
})

ipcMain.handle('project:getLoopLogs', (_event, projectId: string) => {
  const project = stateManager.getProject(projectId)
  return project?.loopLogs ?? []
})

ipcMain.handle('project:clearLoopLogs', (_event, projectId: string) => {
  return stateManager.updateProject(projectId, { loopLogs: [], currentIteration: 0 })
})

// Orchestrator operations
ipcMain.handle('orchestrator:start', async (_event, projectId: string) => {
  const orchestrator = getOrchestrator()
  const project = stateManager.getProject(projectId)
  if (!project) throw new Error('Project not found')

  const success = await orchestrator.startProject(projectId)
  return { success }
})

ipcMain.handle('orchestrator:stop', (_event, projectId: string) => {
  const orchestrator = getOrchestrator()
  const success = orchestrator.stopProject(projectId)
  return { success }
})

ipcMain.handle('orchestrator:pause', (_event, projectId: string) => {
  const orchestrator = getOrchestrator()
  const success = orchestrator.pauseProject(projectId)
  return { success }
})

ipcMain.handle('orchestrator:resume', async (_event, projectId: string) => {
  const orchestrator = getOrchestrator()
  const success = await orchestrator.resumeProject(projectId)
  return { success }
})

ipcMain.handle('orchestrator:status', () => {
  const orchestrator = getOrchestrator()
  const status = orchestrator.getStatus()
  return Object.fromEntries(status)
})

// Check if Claude CLI is available
ipcMain.handle('claude:available', () => {
  const processManager = getProcessManager()
  return processManager.isClaudeAvailable()
})

// GitHub CLI operations
ipcMain.handle('github:authStatus', () => {
  const { execSync } = require('child_process')
  try {
    // Check if gh CLI is installed
    execSync('which gh', { stdio: 'pipe' })
  } catch {
    return { installed: false, authenticated: false, error: 'GitHub CLI (gh) is not installed' }
  }

  try {
    // Check auth status
    const output = execSync('gh auth status', { stdio: 'pipe', encoding: 'utf-8' })
    return { installed: true, authenticated: true, output }
  } catch (error) {
    const err = error as { stderr?: string }
    return {
      installed: true,
      authenticated: false,
      error: err.stderr || 'Not authenticated with GitHub CLI'
    }
  }
})

ipcMain.handle('github:login', async () => {
  const { spawn } = require('child_process')

  return new Promise((resolve) => {
    // Open gh auth login in a new terminal window
    const proc = spawn('gh', ['auth', 'login', '--web'], {
      stdio: 'inherit',
      shell: true
    })

    proc.on('close', (code: number) => {
      if (code === 0) {
        resolve({ success: true })
      } else {
        resolve({ success: false, error: 'Authentication failed or was cancelled' })
      }
    })

    proc.on('error', (err: Error) => {
      resolve({ success: false, error: err.message })
    })
  })
})

ipcMain.handle('github:listRepos', async () => {
  const { execSync } = require('child_process')

  try {
    // Check if gh CLI is installed
    execSync('which gh', { stdio: 'pipe' })
  } catch {
    throw new Error('GitHub CLI (gh) is not installed')
  }

  try {
    // Use gh api to fetch all repos user has access to (personal, org, collaborator)
    // --paginate ensures we get all results, not just the first page
    const output = execSync(
      'gh api /user/repos --paginate -q \'.[] | {name: .name, nameWithOwner: .full_name, url: .html_url, owner: {login: .owner.login}, isPrivate: .private}\'',
      { encoding: 'utf-8', stdio: 'pipe', maxBuffer: 10 * 1024 * 1024 }
    )

    // Parse newline-delimited JSON objects
    const repos = output
      .trim()
      .split('\n')
      .filter((line: string) => line.trim())
      .map((line: string) => JSON.parse(line))

    // Sort by nameWithOwner for consistent ordering
    repos.sort((a: { nameWithOwner: string }, b: { nameWithOwner: string }) =>
      a.nameWithOwner.localeCompare(b.nameWithOwner)
    )

    return repos
  } catch (error) {
    const err = error as { stderr?: string }
    throw new Error(err.stderr || 'Failed to list GitHub repositories')
  }
})

// Repository operations
ipcMain.handle('repository:list', () => {
  return stateManager.getRepositories()
})

ipcMain.handle('repository:create', (_event, input) => {
  return stateManager.createRepository(input)
})

ipcMain.handle('repository:delete', (_event, id: string) => {
  return stateManager.deleteRepository(id)
})

// Ensure directories exist
const paths = stateManager.getDataPaths()
for (const dir of [paths.data, paths.workspaces, paths.logs]) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}
