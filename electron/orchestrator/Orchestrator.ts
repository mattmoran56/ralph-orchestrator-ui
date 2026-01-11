import { BrowserWindow } from 'electron'
import { getStateManager, type Project, type Task, type TaskStatus } from './StateManager'
import { getRepoManager } from './RepoManager'
import { getProcessManager } from './ProcessManager'
import { getVerifier } from './Verifier'

interface OrchestratorState {
  projectId: string
  status: 'initializing' | 'running' | 'paused' | 'stopped' | 'completed' | 'failed'
  currentTaskId: string | null
  currentProcessId: string | null
}

class Orchestrator {
  private activeProjects: Map<string, OrchestratorState> = new Map()
  private maxParallelProjects: number = 3

  constructor() {
    const stateManager = getStateManager()
    this.maxParallelProjects = stateManager.getSettings().maxParallelProjects
  }

  /**
   * Start orchestrating a project
   */
  async startProject(projectId: string): Promise<boolean> {
    const stateManager = getStateManager()
    const project = stateManager.getProject(projectId)

    if (!project) {
      this.log(projectId, 'Project not found')
      return false
    }

    // Check if already running
    if (this.activeProjects.has(projectId)) {
      this.log(projectId, 'Project is already running')
      return false
    }

    // Check parallel limit
    const runningCount = Array.from(this.activeProjects.values())
      .filter((s) => s.status === 'running').length

    if (runningCount >= this.maxParallelProjects) {
      this.log(projectId, `Maximum parallel projects (${this.maxParallelProjects}) reached`)
      return false
    }

    // Initialize orchestrator state
    const orchestratorState: OrchestratorState = {
      projectId,
      status: 'initializing',
      currentTaskId: null,
      currentProcessId: null
    }
    this.activeProjects.set(projectId, orchestratorState)

    // Update project status
    stateManager.updateProject(projectId, { status: 'running' })

    // Start the orchestration loop
    this.runLoop(projectId).catch((error) => {
      this.log(projectId, `Orchestration error: ${error.message}`)
      this.handleError(projectId, error)
    })

    return true
  }

  /**
   * Main orchestration loop for a project
   */
  private async runLoop(projectId: string): Promise<void> {
    const stateManager = getStateManager()
    const repoManager = getRepoManager()

    const orchestratorState = this.activeProjects.get(projectId)
    if (!orchestratorState) return

    orchestratorState.status = 'running'

    let project = stateManager.getProject(projectId)
    if (!project) return

    // Step 1: Setup repository
    this.log(projectId, 'Setting up repository...')
    const setupResult = await this.setupRepository(project)
    if (!setupResult.success) {
      this.log(projectId, `Repository setup failed: ${setupResult.error}`)
      this.handleError(projectId, new Error(setupResult.error))
      return
    }

    const workingDirectory = repoManager.getRepoPath(projectId, project.repoUrl)
    this.log(projectId, `Working directory: ${workingDirectory}`)

    // Main loop
    while (orchestratorState.status === 'running') {
      // Refresh project state
      project = stateManager.getProject(projectId)
      if (!project) break

      // Check if paused or stopped
      if (project.status === 'paused' || project.status === 'idle') {
        orchestratorState.status = 'paused'
        break
      }

      // Get next task to work on
      const nextTask = this.getNextTask(project)

      if (!nextTask) {
        // All tasks complete
        this.log(projectId, 'All tasks completed!')
        await this.completeProject(project, workingDirectory)
        break
      }

      // Work on the task
      await this.workOnTask(project, nextTask, workingDirectory)

      // Small delay between tasks
      await this.delay(2000)
    }
  }

  /**
   * Setup the repository for a project
   */
  private async setupRepository(project: Project): Promise<{ success: boolean; error?: string }> {
    const repoManager = getRepoManager()

    // Step 1: Clone the repository (uses default branch)
    if (!repoManager.workspaceExists(project.id, project.repoUrl)) {
      this.log(project.id, `Cloning repository: ${project.repoUrl}`)
      const cloneResult = await repoManager.cloneRepo(project.id, project.repoUrl)

      if (!cloneResult.success) {
        return { success: false, error: cloneResult.error }
      }
      this.log(project.id, 'Repository cloned successfully')
    } else {
      this.log(project.id, 'Repository already exists, fetching latest...')
      await repoManager.cloneRepo(project.id, project.repoUrl) // This will fetch if exists
    }

    // Step 2: Checkout or create the base branch
    this.log(project.id, `Setting up base branch: ${project.baseBranch}`)
    const baseBranchResult = repoManager.checkoutOrCreateBranch(
      project.id,
      project.repoUrl,
      project.baseBranch
    )

    if (!baseBranchResult.success) {
      return { success: false, error: baseBranchResult.error }
    }
    this.log(project.id, baseBranchResult.output)

    // Step 3: Create/checkout the working branch from base branch
    this.log(project.id, `Setting up working branch: ${project.workingBranch}`)
    const workingBranchResult = repoManager.createBranch(
      project.id,
      project.repoUrl,
      project.workingBranch,
      project.baseBranch
    )

    if (!workingBranchResult.success) {
      return { success: false, error: workingBranchResult.error }
    }
    this.log(project.id, workingBranchResult.output)

    return { success: true }
  }

  /**
   * Get the next task to work on
   */
  private getNextTask(project: Project): Task | null {
    // Priority:
    // 1. Task currently in_progress (resume)
    // 2. Task in verifying that failed (retry)
    // 3. Next backlog task by priority

    // Check for in-progress task
    const inProgress = project.tasks.find((t) => t.status === 'in_progress')
    if (inProgress) return inProgress

    // Check for verifying tasks (might need retry)
    const verifying = project.tasks.find((t) => t.status === 'verifying')
    if (verifying) return verifying

    // Get next backlog task
    const backlogTasks = project.tasks
      .filter((t) => t.status === 'backlog')
      .sort((a, b) => a.priority - b.priority)

    return backlogTasks[0] || null
  }

  /**
   * Work on a single task
   */
  private async workOnTask(
    project: Project,
    task: Task,
    workingDirectory: string
  ): Promise<void> {
    const stateManager = getStateManager()
    const processManager = getProcessManager()
    const verifier = getVerifier()

    const orchestratorState = this.activeProjects.get(project.id)
    if (!orchestratorState || orchestratorState.status !== 'running') return

    orchestratorState.currentTaskId = task.id

    this.log(project.id, `Working on task: ${task.title}`)

    // Update task status to in_progress
    stateManager.updateTask(project.id, task.id, {
      status: 'in_progress',
      attempts: task.attempts + 1
    })

    // Build the prompt
    const prompt = this.buildTaskPrompt(project, task)

    // Get log file path
    const logFilePath = processManager.getLogFilePath(project.id, task.id)

    // Start Claude process
    const processId = await processManager.startProcess({
      projectId: project.id,
      taskId: task.id,
      prompt,
      workingDirectory,
      logFilePath
    })

    orchestratorState.currentProcessId = processId

    // Wait for completion
    const result = await processManager.waitForProcess(processId)

    // Check if stopped
    if (orchestratorState.status !== 'running') {
      return
    }

    // Handle result
    if (result.taskBlocked) {
      this.log(project.id, `Task blocked: ${result.blockedReason}`)

      // Check max attempts
      const settings = stateManager.getSettings()
      if (task.attempts >= settings.maxTaskAttempts) {
        stateManager.updateTask(project.id, task.id, { status: 'blocked' })
        stateManager.addTaskLog(project.id, task.id, {
          filePath: logFilePath,
          summary: `Blocked after ${task.attempts} attempts: ${result.blockedReason}`,
          success: false
        })
      } else {
        // Keep in progress for retry
        stateManager.addTaskLog(project.id, task.id, {
          filePath: logFilePath,
          summary: `Blocked (attempt ${task.attempts}): ${result.blockedReason}`,
          success: false
        })
      }
      return
    }

    if (result.taskComplete) {
      this.log(project.id, `Task reports complete, verifying...`)

      // Move to verifying
      stateManager.updateTask(project.id, task.id, { status: 'verifying' })

      // Run verification
      const verificationResult = await verifier.verifyTask(
        project,
        task,
        workingDirectory
      )

      if (verificationResult.passed) {
        this.log(project.id, `Task verified successfully!`)

        // Mark as done
        stateManager.updateTask(project.id, task.id, { status: 'done' })
        stateManager.addTaskLog(project.id, task.id, {
          filePath: logFilePath,
          summary: 'Task completed and verified',
          success: true
        })

        // Commit changes
        const repoManager = getRepoManager()
        const commitResult = repoManager.commit(
          project.id,
          project.repoUrl,
          `Complete task: ${task.title}`
        )

        if (commitResult.success) {
          this.log(project.id, `Changes committed`)
        }
      } else {
        this.log(project.id, `Verification failed: ${verificationResult.failureReasons.join(', ')}`)

        // Check max attempts
        const settings = stateManager.getSettings()
        if (task.attempts >= settings.maxTaskAttempts) {
          stateManager.updateTask(project.id, task.id, { status: 'blocked' })
          stateManager.addTaskLog(project.id, task.id, {
            filePath: logFilePath,
            summary: `Failed verification after ${task.attempts} attempts`,
            success: false
          })
        } else {
          // Move back to in_progress for retry
          stateManager.updateTask(project.id, task.id, { status: 'in_progress' })
          stateManager.addTaskLog(project.id, task.id, {
            filePath: logFilePath,
            summary: `Verification failed (attempt ${task.attempts}): ${verificationResult.failureReasons.join(', ')}`,
            success: false
          })
        }
      }
    } else {
      // Task didn't complete, add log and continue
      stateManager.addTaskLog(project.id, task.id, {
        filePath: logFilePath,
        summary: `Attempt ${task.attempts} - incomplete`,
        success: false
      })
    }

    orchestratorState.currentProcessId = null
    orchestratorState.currentTaskId = null
  }

  /**
   * Build the prompt for a task
   */
  private buildTaskPrompt(project: Project, task: Task): string {
    const otherTasks = project.tasks
      .filter((t) => t.id !== task.id)
      .map((t) => `- [${t.status}] ${t.title}`)
      .join('\n')

    const criteriaList = task.acceptanceCriteria
      .map((c, i) => `${i + 1}. ${c}`)
      .join('\n')

    return `# Project Context

${project.productBrief || 'No product brief provided.'}

# Solution Overview

${project.solutionBrief || 'No solution brief provided.'}

# Current Task

**Title:** ${task.title}
**Description:** ${task.description}

## Acceptance Criteria
${criteriaList || 'No specific criteria - use your best judgment.'}

# Instructions

Work through this task completely. Follow these guidelines:

1. Read and understand the existing codebase structure
2. Implement the required changes
3. Write clean, well-documented code
4. Test your changes work as expected
5. Commit your changes with clear, descriptive commit messages

When you have completed the task and believe all acceptance criteria are met, output: TASK_COMPLETE

If you encounter a blocker that prevents you from completing the task (missing dependencies, unclear requirements, external service issues), output: TASK_BLOCKED: [describe the blocker]

# Other Tasks (for context only - do NOT work on these)
${otherTasks || 'No other tasks.'}

# Important Notes
- Focus only on the current task
- Do not push to remote - commits only
- If tests exist, make sure they pass
- Follow existing code patterns and conventions`
  }

  /**
   * Complete a project - push and create PR
   */
  private async completeProject(project: Project, workingDirectory: string): Promise<void> {
    const stateManager = getStateManager()
    const repoManager = getRepoManager()

    this.log(project.id, 'Project completed, preparing to create PR...')

    // Push the branch
    const pushResult = repoManager.push(project.id, project.repoUrl, project.workingBranch)

    if (!pushResult.success) {
      this.log(project.id, `Failed to push: ${pushResult.error}`)
      stateManager.updateProject(project.id, { status: 'failed' })
      return
    }

    this.log(project.id, 'Pushed changes to remote')

    // Create PR
    const completedTasks = project.tasks.filter((t) => t.status === 'done')
    const prBody = `## Summary

This PR completes the following tasks:
${completedTasks.map((t) => `- ${t.title}`).join('\n')}

## Project
${project.description}

---
Generated by Ralph Orchestrator`

    const prResult = repoManager.createPullRequest(
      project.id,
      project.repoUrl,
      `[Ralph] ${project.name}`,
      prBody,
      project.baseBranch
    )

    if (prResult.success) {
      this.log(project.id, `PR created: ${prResult.output}`)
    } else {
      this.log(project.id, `Failed to create PR: ${prResult.error}`)
    }

    // Update project status
    stateManager.updateProject(project.id, { status: 'completed' })

    // Clean up workspace
    this.log(project.id, 'Cleaning up workspace...')
    repoManager.cleanupWorkspace(project.id)

    // Remove from active projects
    this.activeProjects.delete(project.id)
  }

  /**
   * Stop a project
   */
  stopProject(projectId: string): boolean {
    const orchestratorState = this.activeProjects.get(projectId)

    if (!orchestratorState) {
      return false
    }

    // Stop current process if running
    if (orchestratorState.currentProcessId) {
      const processManager = getProcessManager()
      processManager.stopProcess(orchestratorState.currentProcessId)
    }

    orchestratorState.status = 'stopped'

    // Update project status
    const stateManager = getStateManager()
    stateManager.updateProject(projectId, { status: 'idle' })

    // If there was a task in progress, move it back to backlog
    if (orchestratorState.currentTaskId) {
      const project = stateManager.getProject(projectId)
      const task = project?.tasks.find((t) => t.id === orchestratorState.currentTaskId)
      if (task && task.status === 'in_progress') {
        stateManager.updateTask(projectId, task.id, { status: 'backlog' })
      }
    }

    this.activeProjects.delete(projectId)
    return true
  }

  /**
   * Pause a project
   */
  pauseProject(projectId: string): boolean {
    const orchestratorState = this.activeProjects.get(projectId)

    if (!orchestratorState || orchestratorState.status !== 'running') {
      return false
    }

    orchestratorState.status = 'paused'

    const stateManager = getStateManager()
    stateManager.updateProject(projectId, { status: 'paused' })

    return true
  }

  /**
   * Resume a paused project
   */
  resumeProject(projectId: string): boolean {
    const stateManager = getStateManager()
    const project = stateManager.getProject(projectId)

    if (!project || project.status !== 'paused') {
      return false
    }

    return this.startProject(projectId)
  }

  /**
   * Handle orchestration errors
   */
  private handleError(projectId: string, error: Error): void {
    const stateManager = getStateManager()
    stateManager.updateProject(projectId, { status: 'failed' })

    const orchestratorState = this.activeProjects.get(projectId)
    if (orchestratorState) {
      orchestratorState.status = 'failed'
    }

    this.log(projectId, `Error: ${error.message}`)
  }

  /**
   * Get status of all active projects
   */
  getStatus(): Map<string, OrchestratorState> {
    return new Map(this.activeProjects)
  }

  /**
   * Log message and notify renderers
   */
  private log(projectId: string, message: string): void {
    const timestamp = new Date().toISOString()
    console.log(`[${timestamp}] [${projectId}] ${message}`)

    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send('orchestrator:log', { projectId, message, timestamp })
    })
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

// Singleton
let orchestrator: Orchestrator | null = null

export function getOrchestrator(): Orchestrator {
  if (!orchestrator) {
    orchestrator = new Orchestrator()
  }
  return orchestrator
}
