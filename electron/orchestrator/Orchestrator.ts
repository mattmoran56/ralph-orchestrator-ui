import { BrowserWindow } from 'electron'
import { getStateManager, type Project } from './StateManager'
import { getRepoManager } from './RepoManager'
import { getProcessManager } from './ProcessManager'

interface OrchestratorState {
  projectId: string
  status: 'initializing' | 'running' | 'paused' | 'stopped' | 'completed' | 'failed'
  currentProcessId: string | null
  doneCount: number
  pollInterval: ReturnType<typeof setInterval> | null
}

// Number of consecutive ALL_DONE signals required before completing
const REQUIRED_DONE_COUNT = 2

// How often to poll workspace files for UI updates (ms)
const WORKSPACE_POLL_INTERVAL = 1000

class Orchestrator {
  private activeProjects: Map<string, OrchestratorState> = new Map()
  private maxParallelProjects: number = 3

  constructor() {
    const stateManager = getStateManager()
    this.maxParallelProjects = stateManager.getSettings().maxParallelProjects
  }

  /**
   * Get the repository URL for a project
   */
  private getRepoUrl(project: Project): string {
    const stateManager = getStateManager()
    const repository = stateManager.getRepository(project.repositoryId)
    if (!repository) {
      throw new Error(`Repository not found for project ${project.id}`)
    }
    return repository.url
  }

  /**
   * Get the repository's default branch (e.g., main)
   */
  private getRepoDefaultBranch(project: Project): string {
    const stateManager = getStateManager()
    const repository = stateManager.getRepository(project.repositoryId)
    if (!repository) {
      throw new Error(`Repository not found for project ${project.id}`)
    }
    return repository.baseBranch
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
      currentProcessId: null,
      doneCount: 0,
      pollInterval: null
    }
    this.activeProjects.set(projectId, orchestratorState)

    // Reset currentIteration only if starting from 'idle' (fresh start)
    // If resuming from 'paused', keep the current iteration count
    if (project.status === 'idle') {
      stateManager.updateProject(projectId, { status: 'running', currentIteration: 0 })
      this.log(projectId, 'Starting fresh, iteration counter reset to 0')
    } else {
      stateManager.updateProject(projectId, { status: 'running' })
      this.log(projectId, `Resuming from iteration ${project.currentIteration}`)
    }

    // Start the orchestration loop
    this.runLoop(projectId).catch((error) => {
      this.log(projectId, `Orchestration error: ${error.message}`)
      this.handleError(projectId, error)
    })

    return true
  }

  /**
   * Main orchestration loop for a project
   *
   * Simplified loop: Claude manages its own task state via workspace files.
   * We call Claude repeatedly until it signals ALL_DONE twice in a row.
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

    const repoUrl = this.getRepoUrl(project)
    const workingDirectory = repoManager.getRepoPath(projectId, repoUrl)
    this.log(projectId, `Working directory: ${workingDirectory}`)

    // Ensure .ralph folder and files exist before watching
    // This creates the folder/files only if they don't exist - never overwrites
    const ralphSetup = repoManager.setupRalphFolder(projectId, repoUrl)
    if (!ralphSetup.success) {
      this.log(projectId, `Warning: Could not setup .ralph folder: ${ralphSetup.error}`)
    }

    // Start watching workspace files for real-time UI updates
    // Tasks are read from workspace, not synced from StateManager
    stateManager.watchWorkspace(projectId)

    // Start polling workspace every second to ensure UI stays in sync
    this.startWorkspacePolling(projectId)

    // Main loop
    while (orchestratorState.status === 'running') {
      // Refresh project state
      project = stateManager.getProject(projectId)
      if (!project) break

      // Increment iteration counter at the start of each loop iteration
      const newIteration = project.currentIteration + 1
      stateManager.updateProject(projectId, { currentIteration: newIteration })
      this.log(projectId, `Starting iteration ${newIteration} of ${project.maxIterations}`)

      // Check if max iterations exceeded
      if (newIteration > project.maxIterations) {
        this.log(projectId, `Max iterations (${project.maxIterations}) reached, pausing project`)
        stateManager.updateProject(projectId, { status: 'paused' })
        orchestratorState.status = 'paused'
        break
      }

      // Check if paused or stopped
      if (project.status === 'paused' || project.status === 'idle') {
        orchestratorState.status = 'paused'
        break
      }

      // Build prompt and run Claude iteration
      // Tasks are read from workspace by Claude - no sync needed
      const prompt = this.buildTaskPrompt(project, newIteration)
      const result = await this.runClaudeIteration(project, prompt, workingDirectory, newIteration)

      // Check if stopped during execution
      if (orchestratorState.status !== 'running') {
        break
      }

      // Check for ALL_DONE signal in Claude's output
      if (result.output.includes('ALL_DONE')) {
        orchestratorState.doneCount++
        this.log(projectId, `ALL_DONE signal received (count: ${orchestratorState.doneCount}/${REQUIRED_DONE_COUNT})`)

        if (orchestratorState.doneCount >= REQUIRED_DONE_COUNT) {
          this.log(projectId, 'Project complete - ALL_DONE confirmed twice')
          await this.completeProject(project, workingDirectory)
          break
        }
      } else {
        // Reset done count if Claude is still working
        if (orchestratorState.doneCount > 0) {
          this.log(projectId, 'Resetting ALL_DONE count - Claude is still working')
        }
        orchestratorState.doneCount = 0
      }

      // Small delay between iterations
      await this.delay(2000)
    }

    // Stop polling and watching workspace files when loop ends
    this.stopWorkspacePolling(projectId)
    stateManager.unwatchWorkspace(projectId)
  }

  /**
   * Start polling workspace files to keep UI in sync
   */
  private startWorkspacePolling(projectId: string): void {
    const stateManager = getStateManager()
    const orchestratorState = this.activeProjects.get(projectId)
    if (!orchestratorState) return

    // Clear any existing poll interval
    if (orchestratorState.pollInterval) {
      clearInterval(orchestratorState.pollInterval)
    }

    // Start polling every second
    orchestratorState.pollInterval = setInterval(() => {
      // Trigger UI refresh by notifying renderers
      // This will cause them to re-read from workspace
      stateManager.triggerNotify()
    }, WORKSPACE_POLL_INTERVAL)

    this.log(projectId, `Started workspace polling (every ${WORKSPACE_POLL_INTERVAL}ms)`)
  }

  /**
   * Stop polling workspace files
   */
  private stopWorkspacePolling(projectId: string): void {
    const orchestratorState = this.activeProjects.get(projectId)
    if (!orchestratorState) return

    if (orchestratorState.pollInterval) {
      clearInterval(orchestratorState.pollInterval)
      orchestratorState.pollInterval = null
      this.log(projectId, 'Stopped workspace polling')
    }
  }

  /**
   * Run a single Claude iteration
   * Returns the result with output - no parsing of task signals needed
   */
  private async runClaudeIteration(
    project: Project,
    prompt: string,
    workingDirectory: string,
    iteration: number
  ): Promise<{ success: boolean; output: string }> {
    const processManager = getProcessManager()
    const orchestratorState = this.activeProjects.get(project.id)

    if (!orchestratorState || orchestratorState.status !== 'running') {
      return { success: false, output: '' }
    }

    // Get log file path
    const logFilePath = processManager.getLogFilePath(project.id, `iteration-${iteration}`)

    this.log(project.id, `Running Claude iteration ${iteration}...`)

    // Start Claude process
    const processId = await processManager.startProcess({
      projectId: project.id,
      taskId: `iteration-${iteration}`,
      prompt,
      workingDirectory,
      logFilePath
    })

    orchestratorState.currentProcessId = processId

    // Wait for completion
    const result = await processManager.waitForProcess(processId)

    orchestratorState.currentProcessId = null

    return {
      success: result.success,
      output: result.output
    }
  }

  /**
   * Setup the repository for a project
   */
  private async setupRepository(project: Project): Promise<{ success: boolean; error?: string }> {
    const repoManager = getRepoManager()
    const repoUrl = this.getRepoUrl(project)
    const repoDefaultBranch = this.getRepoDefaultBranch(project)

    // Step 1: Clone the repository (uses default branch)
    if (!repoManager.workspaceExists(project.id, repoUrl)) {
      this.log(project.id, `Cloning repository: ${repoUrl}`)
      const cloneResult = await repoManager.cloneRepo(project.id, repoUrl)

      if (!cloneResult.success) {
        return { success: false, error: cloneResult.error }
      }
      this.log(project.id, 'Repository cloned successfully')
    } else {
      this.log(project.id, 'Repository already exists, fetching latest...')
      await repoManager.cloneRepo(project.id, repoUrl) // This will fetch if exists
    }

    // Step 2: Checkout or create the base branch FROM the repository's default branch
    this.log(project.id, `Setting up base branch: ${project.baseBranch} (from ${repoDefaultBranch})`)
    const baseBranchResult = repoManager.checkoutOrCreateFromSource(
      project.id,
      repoUrl,
      project.baseBranch,
      repoDefaultBranch
    )

    if (!baseBranchResult.success) {
      return { success: false, error: baseBranchResult.error }
    }
    this.log(project.id, baseBranchResult.output)

    // Step 3: If base branch already existed, merge in the latest from repo's default branch
    if (baseBranchResult.output.includes('Switched to existing') ||
        baseBranchResult.output.includes('Checked out remote')) {
      this.log(project.id, `Merging latest ${repoDefaultBranch} into ${project.baseBranch}...`)
      const mergeResult = repoManager.mergeBranch(project.id, repoUrl, repoDefaultBranch)
      if (mergeResult.success) {
        this.log(project.id, `Merged ${repoDefaultBranch} successfully`)
      } else {
        // Merge conflicts - log but continue (Claude can resolve if needed)
        this.log(project.id, `Merge warning: ${mergeResult.error || 'conflicts may exist'}`)
      }
    }

    // Step 4: Create/checkout the working branch from base branch
    this.log(project.id, `Setting up working branch: ${project.workingBranch}`)
    const workingBranchResult = repoManager.createBranch(
      project.id,
      repoUrl,
      project.workingBranch,
      project.baseBranch
    )

    if (!workingBranchResult.success) {
      return { success: false, error: workingBranchResult.error }
    }
    this.log(project.id, workingBranchResult.output)

    // Step 5: Merge the latest default branch into working branch too
    this.log(project.id, `Ensuring working branch has latest ${repoDefaultBranch}...`)
    const workingMergeResult = repoManager.mergeBranch(project.id, repoUrl, repoDefaultBranch)
    if (workingMergeResult.success) {
      this.log(project.id, `Working branch is up to date with ${repoDefaultBranch}`)
    } else {
      this.log(project.id, `Merge note: ${workingMergeResult.error || 'already up to date or conflicts'}`)
    }

    return { success: true }
  }

  /**
   * Build the prompt for Claude to manage its own task state
   * Claude reads tasks.json, picks a task, updates status, and works on it
   */
  private buildTaskPrompt(project: Project, iteration: number): string {
    return `# Project Context

**Project:** ${project.name}
**Description:** ${project.description}
**Iteration:** ${iteration} of ${project.maxIterations}

## Product Brief

${project.productBrief || 'No product brief provided.'}

## Solution Brief

${project.solutionBrief || 'No solution brief provided.'}

# Task Management

Your tasks are stored in \`.ralph/tasks.json\` in the workspace. You are responsible for managing task state yourself.

## Reading Tasks

Read \`.ralph/tasks.json\` to see all tasks. The file has this structure:
\`\`\`json
{
  "project": { "id": "...", "name": "...", ... },
  "tasks": [
    {
      "id": "task-1",
      "title": "...",
      "description": "...",
      "acceptanceCriteria": ["...", "..."],
      "priority": 1,
      "status": "backlog",
      "attempts": 0,
      "startedAt": null,
      "verifyingAt": null,
      "completedAt": null
    }
  ]
}
\`\`\`

## Task Priority

Pick ONE task to work on using this priority order:
1. **in_progress** - Continue any task you previously started (unless truly blocked)
2. **verifying** - Fix any task where verification failed
3. **backlog** - Pick the highest priority (lowest number) task from backlog

## Updating Task Status

**IMPORTANT:** Before you start working on a task, you MUST update its status in \`.ralph/tasks.json\`:

1. **Starting work**: Update the task to:
   - \`status\`: "in_progress"
   - \`attempts\`: increment by 1
   - \`startedAt\`: current ISO timestamp (if not already set)

2. **Ready to verify**: After implementing, update to:
   - \`status\`: "verifying"
   - \`verifyingAt\`: current ISO timestamp

3. **Verification passed**: Update to:
   - \`status\`: "done"
   - \`completedAt\`: current ISO timestamp

4. **Verification failed**: Keep as:
   - \`status\`: "in_progress" (for retry next iteration)

5. **Cannot complete**: Update to:
   - \`status\`: "blocked"

## Logging Changes

Append log entries to \`.ralph/logs.json\` to record your progress. The file structure:
\`\`\`json
{
  "entries": [
    {
      "timestamp": "2026-01-11T10:00:00.000Z",
      "iteration": 1,
      "taskId": "task-1",
      "action": "status_change",
      "from": "backlog",
      "to": "in_progress",
      "message": "Starting work on task"
    }
  ]
}
\`\`\`

Log entry actions include:
- \`status_change\` - When changing task status (include \`from\` and \`to\`)
- \`commit\` - When making a commit
- \`verification\` - When running verification
- \`error\` - When encountering an error

# Workflow

1. Read \`.ralph/tasks.json\` to see all tasks
2. Pick ONE task using the priority order above
3. **Before coding**: Update the task status to "in_progress" in tasks.json and log the change
4. Implement the task following acceptance criteria
5. Commit your changes with descriptive messages (log each commit)
6. Update status to "verifying" and run verification (e.g., \`npm run typecheck\`, \`npm run lint\`, \`npm run build\`)
7. If verification passes: Update status to "done"
8. If verification fails: Keep as "in_progress" for retry

# Completion Signal

After completing your work for this iteration, check the task statuses:

- If **ALL tasks** are either "done" or "blocked", output: \`ALL_DONE\`
- Otherwise, just complete your current task - the orchestrator will call you again

**IMPORTANT:** Only output \`ALL_DONE\` when there are no more tasks in "backlog", "in_progress", or "verifying" status.

# Important Notes

- Work on exactly ONE task per iteration
- Always update task status BEFORE starting work
- Do not push to remote - commits only
- If tests exist, make sure they pass
- Follow existing code patterns and conventions`
  }

  /**
   * Complete a project - push and create PR
   */
  private async completeProject(project: Project, _workingDirectory: string): Promise<void> {
    const stateManager = getStateManager()
    const repoManager = getRepoManager()
    const repoUrl = this.getRepoUrl(project)
    const repoDefaultBranch = this.getRepoDefaultBranch(project)

    const completedTasks = project.tasks.filter((t) => t.status === 'done')
    const blockedTasks = project.tasks.filter((t) => t.status === 'blocked')

    this.log(project.id, `Project finished - ${completedTasks.length} tasks completed, ${blockedTasks.length} blocked`)

    // Check if there are any completed tasks to create a PR for
    if (completedTasks.length === 0) {
      this.log(project.id, 'No tasks were completed - skipping PR creation')
      stateManager.updateProject(project.id, { status: blockedTasks.length > 0 ? 'failed' : 'completed' })
      this.activeProjects.delete(project.id)
      return
    }

    // Check if working branch has any commits ahead of repo's default branch
    const diffCheck = repoManager.getDiffFromBase(project.id, repoUrl, repoDefaultBranch)
    if (diffCheck.success && !diffCheck.output.trim()) {
      this.log(project.id, 'No changes to merge - skipping PR creation')
      stateManager.updateProject(project.id, { status: 'completed' })
      repoManager.cleanupWorkspace(project.id)
      this.activeProjects.delete(project.id)
      return
    }

    this.log(project.id, 'Preparing to create PR...')

    // Push the working branch
    const pushResult = repoManager.push(project.id, repoUrl, project.workingBranch)

    if (!pushResult.success) {
      this.log(project.id, `Failed to push: ${pushResult.error}`)
      stateManager.updateProject(project.id, { status: 'failed' })
      this.log(project.id, 'Cleaning up workspace...')
      repoManager.cleanupWorkspace(project.id)
      this.activeProjects.delete(project.id)
      return
    }

    this.log(project.id, 'Working branch pushed to remote')

    // Build PR body
    let prBody = `## Summary\n\nThis PR completes the following tasks:\n${completedTasks.map((t) => `- ${t.title}`).join('\n')}`

    if (blockedTasks.length > 0) {
      prBody += `\n\n## Blocked Tasks\nThe following tasks could not be completed:\n${blockedTasks.map((t) => `- ${t.title}`).join('\n')}`
    }

    prBody += `\n\n## Project\n${project.description}\n\n---\nGenerated by Ralph Orchestrator`

    // Create PR to merge working branch into repository's DEFAULT branch (e.g., main)
    this.log(project.id, `Creating PR: ${project.workingBranch} -> ${repoDefaultBranch}`)
    const prResult = repoManager.createPullRequest(
      project.id,
      repoUrl,
      `[Ralph] ${project.name}`,
      prBody,
      repoDefaultBranch
    )

    if (prResult.success) {
      this.log(project.id, `PR created: ${prResult.output}`)
      // Update project status to completed
      stateManager.updateProject(project.id, { status: 'completed' })
    } else {
      this.log(project.id, `Failed to create PR: ${prResult.error}`)
      // Mark project as failed if PR creation fails - tasks remain done
      stateManager.updateProject(project.id, { status: 'failed' })
    }

    // Clean up workspace
    this.log(project.id, 'Cleaning up workspace...')
    repoManager.cleanupWorkspace(project.id)

    // Remove from active projects
    this.activeProjects.delete(project.id)
  }

  /**
   * Stop a project
   * Note: Task state is now managed by Claude via workspace files,
   * so we don't need to manipulate task status here.
   */
  stopProject(projectId: string): boolean {
    const orchestratorState = this.activeProjects.get(projectId)

    if (!orchestratorState) {
      return false
    }

    // Stop polling workspace
    this.stopWorkspacePolling(projectId)

    // Stop current process if running
    if (orchestratorState.currentProcessId) {
      const processManager = getProcessManager()
      processManager.stopProcess(orchestratorState.currentProcessId)
    }

    orchestratorState.status = 'stopped'

    // Update project status
    const stateManager = getStateManager()
    stateManager.updateProject(projectId, { status: 'idle' })

    // Stop watching workspace files
    stateManager.unwatchWorkspace(projectId)

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

    // Stop polling workspace
    this.stopWorkspacePolling(projectId)

    orchestratorState.status = 'paused'

    const stateManager = getStateManager()
    stateManager.updateProject(projectId, { status: 'paused' })

    // Stop watching workspace files
    stateManager.unwatchWorkspace(projectId)

    return true
  }

  /**
   * Resume a paused project
   */
  async resumeProject(projectId: string): Promise<boolean> {
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

    // Stop watching workspace files on error
    stateManager.unwatchWorkspace(projectId)

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
