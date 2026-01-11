// Project types
export type ProjectStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed'
export type TaskStatus = 'backlog' | 'in_progress' | 'verifying' | 'done' | 'blocked'

export interface LogEntry {
  timestamp: string
  filePath: string
  summary: string
  success: boolean
}

export interface Task {
  id: string
  title: string
  description: string
  acceptanceCriteria: string[]
  status: TaskStatus
  priority: number
  logs: LogEntry[]
  attempts: number
  createdAt: string
  updatedAt: string
}

export interface Project {
  id: string
  name: string
  description: string
  productBrief: string
  solutionBrief: string
  repoUrl: string
  baseBranch: string
  workingBranch: string
  status: ProjectStatus
  tasks: Task[]
  createdAt: string
  updatedAt: string
}

export interface Settings {
  maxParallelProjects: number
  maxTaskAttempts: number
  workspacesPath: string
  claudeExecutable: string
}

export interface AppState {
  projects: Project[]
  settings: Settings
}

// Form types for creating/editing
export interface CreateProjectInput {
  name: string
  description: string
  productBrief: string
  solutionBrief: string
  repoUrl: string
  baseBranch: string
}

export interface CreateTaskInput {
  title: string
  description: string
  acceptanceCriteria: string[]
  priority?: number
}

export interface UpdateProjectInput {
  name?: string
  description?: string
  productBrief?: string
  solutionBrief?: string
  repoUrl?: string
  baseBranch?: string
  status?: ProjectStatus
}

export interface UpdateTaskInput {
  title?: string
  description?: string
  acceptanceCriteria?: string[]
  status?: TaskStatus
  priority?: number
}

// Electron API types
export interface ElectronAPI {
  getPaths: () => Promise<{ data: string; workspaces: string; logs: string }>
  getAppVersion: () => Promise<string>
  getState: () => Promise<AppState>
  saveState: (state: AppState) => Promise<void>
  createProject: (project: CreateProjectInput) => Promise<Project>
  updateProject: (id: string, updates: UpdateProjectInput) => Promise<Project>
  deleteProject: (id: string) => Promise<void>
  createTask: (projectId: string, task: CreateTaskInput) => Promise<Task>
  updateTask: (projectId: string, taskId: string, updates: UpdateTaskInput) => Promise<Task>
  deleteTask: (projectId: string, taskId: string) => Promise<void>
  startProject: (projectId: string) => Promise<void>
  stopProject: (projectId: string) => Promise<void>
  pauseProject: (projectId: string) => Promise<void>
  getTaskLogs: (projectId: string, taskId: string) => Promise<string>
  onStateChange: (callback: (state: AppState) => void) => () => void
  onLogUpdate: (callback: (data: { projectId: string; taskId: string; log: string }) => void) => () => void
}

// Extend Window interface
declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
