import { ipcMain, app } from 'electron'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { getStateManager } from '../orchestrator/StateManager'
import { getOrchestrator } from '../orchestrator/Orchestrator'
import { getProcessManager } from '../orchestrator/ProcessManager'
import { getRepoManager } from '../orchestrator/RepoManager'

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
  return stateManager.updateTask(projectId, taskId, updates)
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

// Ensure directories exist
const paths = stateManager.getDataPaths()
for (const dir of [paths.data, paths.workspaces, paths.logs]) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}
