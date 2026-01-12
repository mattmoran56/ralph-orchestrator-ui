import { ipcMain, app } from 'electron'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { getStateManager, WorkspaceTasksData, TaskStatus } from '../orchestrator/StateManager'
import { getOrchestrator } from '../orchestrator/Orchestrator'
import { getProcessManager } from '../orchestrator/ProcessManager'
import { getRepoManager } from '../orchestrator/RepoManager'
import { v4 as uuidv4 } from 'uuid'

// Initialize state manager and repo manager
const stateManager = getStateManager()
const repoManager = getRepoManager()

/**
 * Read tasks from workspace .ralph/tasks.json
 * Returns the tasks array or empty array if not found
 */
function readWorkspaceTasks(projectId: string): WorkspaceTasksData | null {
  return stateManager.readWorkspaceTasks(projectId)
}

/**
 * Write tasks to workspace .ralph/tasks.json
 * This is the primary storage for tasks - state.json does NOT store tasks
 */
function writeWorkspaceTasks(projectId: string, data: WorkspaceTasksData): boolean {
  return stateManager.writeWorkspaceTasks(projectId, data)
}

/**
 * Get project metadata for workspace tasks.json
 */
function getProjectMetadata(projectId: string): WorkspaceTasksData['project'] | null {
  const project = stateManager.getProject(projectId)
  if (!project) return null
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    productBrief: project.productBrief,
    solutionBrief: project.solutionBrief
  }
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
  // Return state with tasks merged from workspace files
  return stateManager.getStateWithWorkspaceTasks()
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

  // Sync project metadata to workspace if name, description, or briefs changed
  if (result && (updates.name || updates.description || updates.productBrief || updates.solutionBrief)) {
    const workspaceData = readWorkspaceTasks(id)
    if (workspaceData) {
      workspaceData.project = {
        id: result.id,
        name: result.name,
        description: result.description,
        productBrief: result.productBrief,
        solutionBrief: result.solutionBrief
      }
      writeWorkspaceTasks(id, workspaceData)
    }
  }

  return result
})

ipcMain.handle('project:delete', (_event, id: string) => {
  return stateManager.deleteProject(id)
})

// Sync tasks - kept for backwards compatibility but now just triggers notify
// since workspace is the source of truth
ipcMain.handle('project:syncTasks', (_event, projectId: string) => {
  const project = stateManager.getProject(projectId)
  if (!project) {
    return { success: false, error: 'Project not found' }
  }

  // Just trigger a notify to refresh UI from workspace
  stateManager.triggerNotify()
  return { success: true }
})

// Task operations - ALL task data is stored in workspace .ralph/tasks.json

ipcMain.handle('task:list', (_event, projectId: string) => {
  const workspaceData = readWorkspaceTasks(projectId)
  return workspaceData?.tasks || []
})

ipcMain.handle('task:get', (_event, projectId: string, taskId: string) => {
  const workspaceData = readWorkspaceTasks(projectId)
  if (!workspaceData) return null
  return workspaceData.tasks.find((t) => t.id === taskId) || null
})

ipcMain.handle('task:create', (_event, projectId: string, input) => {
  const workspaceData = readWorkspaceTasks(projectId)
  const projectMeta = getProjectMetadata(projectId)

  if (!projectMeta) {
    console.error(`[ipc] Project not found: ${projectId}`)
    return null
  }

  const existingTasks = workspaceData?.tasks || []

  const newTask = {
    id: uuidv4(),
    title: input.title,
    description: input.description || '',
    acceptanceCriteria: input.acceptanceCriteria || [],
    priority: input.priority ?? existingTasks.length,
    status: (input.status as TaskStatus) || 'backlog',
    attempts: 0,
    startedAt: null,
    verifyingAt: null,
    completedAt: null
  }

  const updatedData: WorkspaceTasksData = {
    project: workspaceData?.project || projectMeta,
    tasks: [...existingTasks, newTask]
  }

  const success = writeWorkspaceTasks(projectId, updatedData)
  if (!success) {
    console.error(`[ipc] Failed to write task to workspace: ${projectId}`)
    return null
  }

  // Notify renderers of the change
  stateManager.triggerNotify()

  return newTask
})

ipcMain.handle('task:update', (_event, projectId: string, taskId: string, updates) => {
  const workspaceData = readWorkspaceTasks(projectId)
  if (!workspaceData) {
    console.error(`[ipc] Workspace not found for project: ${projectId}`)
    return null
  }

  const taskIndex = workspaceData.tasks.findIndex((t) => t.id === taskId)
  if (taskIndex === -1) {
    console.error(`[ipc] Task not found: ${taskId}`)
    return null
  }

  // Update the task
  workspaceData.tasks[taskIndex] = {
    ...workspaceData.tasks[taskIndex],
    ...updates
  }

  const success = writeWorkspaceTasks(projectId, workspaceData)
  if (!success) {
    console.error(`[ipc] Failed to update task in workspace: ${projectId}`)
    return null
  }

  // If a task was moved to backlog and project is not running, reset project to idle
  if (updates.status === 'backlog') {
    const project = stateManager.getProject(projectId)
    if (project && project.status !== 'running') {
      const hasBacklogTasks = workspaceData.tasks.some((t) => t.status === 'backlog')
      if (hasBacklogTasks) {
        stateManager.updateProject(projectId, { status: 'idle' })
      }
    }
  }

  // Notify renderers of the change
  stateManager.triggerNotify()

  return workspaceData.tasks[taskIndex]
})

ipcMain.handle('task:delete', (_event, projectId: string, taskId: string) => {
  const workspaceData = readWorkspaceTasks(projectId)
  if (!workspaceData) {
    console.error(`[ipc] Workspace not found for project: ${projectId}`)
    return false
  }

  const taskIndex = workspaceData.tasks.findIndex((t) => t.id === taskId)
  if (taskIndex === -1) {
    console.error(`[ipc] Task not found: ${taskId}`)
    return false
  }

  // Remove the task
  workspaceData.tasks.splice(taskIndex, 1)

  const success = writeWorkspaceTasks(projectId, workspaceData)
  if (!success) {
    console.error(`[ipc] Failed to delete task from workspace: ${projectId}`)
    return false
  }

  // Notify renderers of the change
  stateManager.triggerNotify()

  return true
})

ipcMain.handle('task:reorder', (_event, projectId: string, taskIds: string[]) => {
  const workspaceData = readWorkspaceTasks(projectId)
  if (!workspaceData) {
    console.error(`[ipc] Workspace not found for project: ${projectId}`)
    return false
  }

  // Update each task's priority based on its position in the taskIds array
  for (let i = 0; i < taskIds.length; i++) {
    const task = workspaceData.tasks.find((t) => t.id === taskIds[i])
    if (task) {
      task.priority = i
    }
  }

  const success = writeWorkspaceTasks(projectId, workspaceData)
  if (!success) {
    console.error(`[ipc] Failed to reorder tasks in workspace: ${projectId}`)
    return false
  }

  // Notify renderers of the change
  stateManager.triggerNotify()

  return true
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

// Get workspace logs from .ralph/logs.json
ipcMain.handle('project:getWorkspaceLogs', (_event, projectId: string) => {
  const logsData = stateManager.readWorkspaceLogs(projectId)
  if (!logsData) {
    // Return empty array if logs.json doesn't exist yet
    return []
  }
  return logsData.entries
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
