import { contextBridge, ipcRenderer } from 'electron'

// Expose protected methods to the renderer process
const api = {
  // Paths
  getPaths: () => ipcRenderer.invoke('get-paths'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // State management (to be expanded in Phase 2)
  getState: () => ipcRenderer.invoke('state:get'),
  saveState: (state: unknown) => ipcRenderer.invoke('state:save', state),

  // Project operations (to be expanded in Phase 3+)
  createProject: (project: unknown) => ipcRenderer.invoke('project:create', project),
  updateProject: (id: string, updates: unknown) => ipcRenderer.invoke('project:update', id, updates),
  deleteProject: (id: string) => ipcRenderer.invoke('project:delete', id),

  // Task operations
  createTask: (projectId: string, task: unknown) => ipcRenderer.invoke('task:create', projectId, task),
  updateTask: (projectId: string, taskId: string, updates: unknown) =>
    ipcRenderer.invoke('task:update', projectId, taskId, updates),
  deleteTask: (projectId: string, taskId: string) =>
    ipcRenderer.invoke('task:delete', projectId, taskId),

  // Orchestrator operations
  startProject: (projectId: string) => ipcRenderer.invoke('orchestrator:start', projectId),
  stopProject: (projectId: string) => ipcRenderer.invoke('orchestrator:stop', projectId),
  pauseProject: (projectId: string) => ipcRenderer.invoke('orchestrator:pause', projectId),
  resumeProject: (projectId: string) => ipcRenderer.invoke('orchestrator:resume', projectId),
  getOrchestratorStatus: () => ipcRenderer.invoke('orchestrator:status'),
  isClaudeAvailable: () => ipcRenderer.invoke('claude:available'),

  // Logs
  getTaskLogs: (projectId: string, taskId: string) =>
    ipcRenderer.invoke('logs:get', projectId, taskId),

  // Event subscriptions
  onStateChange: (callback: (state: unknown) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, state: unknown) => callback(state)
    ipcRenderer.on('state:changed', subscription)
    return () => ipcRenderer.removeListener('state:changed', subscription)
  },

  onLogUpdate: (callback: (data: { projectId: string; taskId: string; log: string }) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, data: { projectId: string; taskId: string; log: string }) => callback(data)
    ipcRenderer.on('log:update', subscription)
    return () => ipcRenderer.removeListener('log:update', subscription)
  },

  onOrchestratorLog: (callback: (data: { projectId: string; message: string; timestamp: string }) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, data: { projectId: string; message: string; timestamp: string }) => callback(data)
    ipcRenderer.on('orchestrator:log', subscription)
    return () => ipcRenderer.removeListener('orchestrator:log', subscription)
  }
}

// Expose the API to the renderer
contextBridge.exposeInMainWorld('electronAPI', api)

// Type declaration for the renderer
export type ElectronAPI = typeof api
