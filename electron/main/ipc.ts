import { ipcMain, app } from 'electron'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { getStateManager, WorkspaceTasksData } from '../orchestrator/StateManager'
import { getOrchestrator } from '../orchestrator/Orchestrator'
import { getProcessManager } from '../orchestrator/ProcessManager'
import { getRepoManager } from '../orchestrator/RepoManager'

// Initialize state manager and repo manager
const stateManager = getStateManager()
const repoManager = getRepoManager()

/**
 * Helper function to sync a project's tasks to the workspace tasks.json file.
 * This should be called after any task modification (create, update, delete, reorder).
 * Handles missing workspaces gracefully - workspace may not exist yet.
 */
function syncTasksToWorkspace(projectId: string): boolean {
  const project = stateManager.getProject(projectId)
  if (!project) return false

  // Build the workspace tasks data structure
  const tasksData: WorkspaceTasksData = {
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      productBrief: project.productBrief,
      solutionBrief: project.solutionBrief
    },
    tasks: project.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      acceptanceCriteria: task.acceptanceCriteria,
      priority: task.priority,
      status: task.status,
      attempts: task.attempts,
      startedAt: task.startedAt || null,
      verifyingAt: task.verifyingAt || null,
      completedAt: task.completedAt || null
    }))
  }

  // Attempt to write - this will fail gracefully if workspace doesn't exist
  const success = stateManager.writeWorkspaceTasks(projectId, tasksData)
  if (!success) {
    // This is expected if workspace hasn't been set up yet - not an error
    console.log(`[ipc] Could not sync tasks to workspace for project ${projectId} - workspace may not exist yet`)
  }
  return success
}

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

ipcMain.handle('project:create', async (_event, input) => {
  // Create the project in StateManager first
  const project = stateManager.createProject(input)

  // Get repository URL to clone
  const repository = stateManager.getRepository(input.repositoryId)
  if (repository) {
    try {
      // Clone the repository
      const cloneResult = await repoManager.cloneRepo(project.id, repository.url)
      if (!cloneResult.success) {
        console.error(`Failed to clone repository for project ${project.id}:`, cloneResult.error)
        // Continue - project still created, workspace setup will be deferred
      } else {
        // Checkout or create the working branch
        const branchResult = repoManager.checkoutOrCreateBranch(
          project.id,
          repository.url,
          project.workingBranch
        )
        if (!branchResult.success) {
          console.error(`Failed to checkout branch for project ${project.id}:`, branchResult.error)
        }

        // Setup the .ralph folder
        const ralphResult = repoManager.setupRalphFolder(project.id, repository.url)
        if (!ralphResult.success) {
          console.error(`Failed to setup .ralph folder for project ${project.id}:`, ralphResult.error)
        } else {
          // Write initial tasks.json with project metadata
          const tasksData: WorkspaceTasksData = {
            project: {
              id: project.id,
              name: project.name,
              description: project.description,
              productBrief: project.productBrief,
              solutionBrief: project.solutionBrief
            },
            tasks: []
          }
          const writeSuccess = stateManager.writeWorkspaceTasks(project.id, tasksData)
          if (!writeSuccess) {
            console.error(`Failed to write initial tasks.json for project ${project.id}`)
          }
        }
      }
    } catch (error) {
      console.error(`Error during workspace setup for project ${project.id}:`, error)
      // Continue - project still created, workspace setup can be retried
    }
  }

  return project
})

ipcMain.handle('project:update', (_event, id: string, updates) => {
  const result = stateManager.updateProject(id, updates)

  // Sync to workspace if project metadata changed (name, description, briefs)
  if (result && (updates.name || updates.description || updates.productBrief || updates.solutionBrief)) {
    syncTasksToWorkspace(id)
  }

  return result
})

ipcMain.handle('project:delete', (_event, id: string) => {
  return stateManager.deleteProject(id)
})

// Sync tasks from StateManager to workspace tasks.json
ipcMain.handle('project:syncTasks', (_event, projectId: string) => {
  const project = stateManager.getProject(projectId)
  if (!project) {
    return { success: false, error: 'Project not found' }
  }

  // Build the workspace tasks data structure
  const tasksData: WorkspaceTasksData = {
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      productBrief: project.productBrief,
      solutionBrief: project.solutionBrief
    },
    tasks: project.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      acceptanceCriteria: task.acceptanceCriteria,
      priority: task.priority,
      status: task.status,
      attempts: task.attempts,
      startedAt: task.startedAt || null,
      verifyingAt: task.verifyingAt || null,
      completedAt: task.completedAt || null
    }))
  }

  const success = stateManager.writeWorkspaceTasks(projectId, tasksData)
  if (!success) {
    return { success: false, error: 'Failed to write tasks.json - workspace may not exist' }
  }

  return { success: true }
})

// Task operations
ipcMain.handle('task:list', (_event, projectId: string) => {
  return stateManager.getTasks(projectId)
})

ipcMain.handle('task:get', (_event, projectId: string, taskId: string) => {
  return stateManager.getTask(projectId, taskId)
})

ipcMain.handle('task:create', (_event, projectId: string, input) => {
  const task = stateManager.createTask(projectId, input)
  if (task) {
    // Sync to workspace after creating task
    syncTasksToWorkspace(projectId)
  }
  return task
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

  // Sync to workspace after updating task
  if (result) {
    syncTasksToWorkspace(projectId)
  }

  return result
})

ipcMain.handle('task:delete', (_event, projectId: string, taskId: string) => {
  const result = stateManager.deleteTask(projectId, taskId)
  if (result) {
    // Sync to workspace after deleting task
    syncTasksToWorkspace(projectId)
  }
  return result
})

ipcMain.handle('task:reorder', (_event, projectId: string, taskIds: string[]) => {
  // Update priorities based on the new order
  const project = stateManager.getProject(projectId)
  if (!project) return false

  // Update each task's priority based on its position in the taskIds array
  let updated = false
  for (let i = 0; i < taskIds.length; i++) {
    const result = stateManager.updateTask(projectId, taskIds[i], { priority: i })
    if (result) updated = true
  }

  // Sync to workspace after reordering
  if (updated) {
    syncTasksToWorkspace(projectId)
  }

  return updated
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

// Loop/iteration operations
// Note: Loop logs are now read from workspace .ralph/logs.json files (see task-09)
// This handler only resets the iteration counter
ipcMain.handle('project:clearLoopLogs', (_event, projectId: string) => {
  return stateManager.updateProject(projectId, { currentIteration: 0 })
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
