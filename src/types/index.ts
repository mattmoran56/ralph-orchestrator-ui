// Project types
export type ProjectStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed'
export type TaskStatus = 'backlog' | 'in_progress' | 'verifying' | 'done' | 'blocked'
export type LoopStep = 'task_selection' | 'execution' | 'verification' | 'result'

export interface LoopLogEntry {
  id: string
  iteration: number
  timestamp: string
  step: LoopStep
  taskId?: string
  taskTitle?: string
  message: string
  details?: string
}

// Repository type (top-level container for projects)
export interface Repository {
  id: string
  name: string                // e.g., "ralph-orchestrator-ui"
  nameWithOwner: string       // e.g., "matt/ralph-orchestrator-ui"
  url: string                 // e.g., "https://github.com/matt/ralph-orchestrator-ui"
  owner: string               // e.g., "matt"
  baseBranch: string          // e.g., "main"
  isPrivate: boolean
  createdAt: string
  updatedAt: string
}

// GitHub repo from gh CLI (before being added to local state)
export interface GitHubRepo {
  name: string
  nameWithOwner: string
  url: string
  owner: { login: string }
  isPrivate: boolean
}

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
  // Timing fields for state transitions
  startedAt?: string      // When moved to in_progress
  verifyingAt?: string    // When moved to verifying
  completedAt?: string    // When moved to done or blocked
}

export interface Project {
  id: string
  repositoryId: string        // Reference to parent Repository
  name: string
  description: string
  productBrief: string
  solutionBrief: string
  baseBranch: string          // Can override repository's baseBranch
  workingBranch: string
  status: ProjectStatus
  tasks: Task[]
  maxIterations: number
  currentIteration: number
  loopLogs: LoopLogEntry[]
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
  repositories: Repository[]
  projects: Project[]
  settings: Settings
}

// Form types for creating/editing
export interface CreateRepositoryInput {
  name: string
  nameWithOwner: string
  url: string
  owner: string
  baseBranch: string
  isPrivate: boolean
}

export interface CreateProjectInput {
  repositoryId: string
  name: string
  description: string
  productBrief: string
  solutionBrief: string
  baseBranch: string
}

export interface CreateTaskInput {
  title: string
  description: string
  acceptanceCriteria: string[]
  priority?: number
  status?: TaskStatus
}

export interface UpdateProjectInput {
  name?: string
  description?: string
  productBrief?: string
  solutionBrief?: string
  baseBranch?: string
  status?: ProjectStatus
  maxIterations?: number
}

export interface UpdateTaskInput {
  title?: string
  description?: string
  acceptanceCriteria?: string[]
  status?: TaskStatus
  priority?: number
  startedAt?: string
  verifyingAt?: string
  completedAt?: string
}

// GitHub auth status
export interface GitHubAuthStatus {
  installed: boolean
  authenticated: boolean
  error?: string
  output?: string
}

// Electron API types
export interface ElectronAPI {
  getPaths: () => Promise<{ data: string; workspaces: string; logs: string }>
  getAppVersion: () => Promise<string>
  getState: () => Promise<AppState>
  saveState: (state: AppState) => Promise<void>
  reloadState: () => Promise<AppState>
  // Repository operations
  listGitHubRepos: () => Promise<GitHubRepo[]>
  getRepositories: () => Promise<Repository[]>
  createRepository: (input: CreateRepositoryInput) => Promise<Repository>
  deleteRepository: (id: string) => Promise<void>
  // Project operations
  createProject: (project: CreateProjectInput) => Promise<Project>
  updateProject: (id: string, updates: UpdateProjectInput) => Promise<Project>
  deleteProject: (id: string) => Promise<void>
  // Task operations
  createTask: (projectId: string, task: CreateTaskInput) => Promise<Task>
  updateTask: (projectId: string, taskId: string, updates: UpdateTaskInput) => Promise<Task>
  deleteTask: (projectId: string, taskId: string) => Promise<void>
  // Orchestrator operations
  startProject: (projectId: string) => Promise<void>
  stopProject: (projectId: string) => Promise<void>
  pauseProject: (projectId: string) => Promise<void>
  getTaskLogs: (projectId: string, taskId: string) => Promise<string>
  isClaudeAvailable: () => Promise<boolean>
  // Loop log operations
  addLoopLog: (projectId: string, iteration: number, step: LoopStep, message: string, taskId?: string, details?: string) => Promise<LoopLogEntry | null>
  getLoopLogs: (projectId: string) => Promise<LoopLogEntry[]>
  clearLoopLogs: (projectId: string) => Promise<Project | null>
  // GitHub auth
  getGitHubAuthStatus: () => Promise<GitHubAuthStatus>
  loginToGitHub: () => Promise<{ success: boolean; error?: string }>
  // Event subscriptions
  onStateChange: (callback: (state: AppState) => void) => () => void
  onLogUpdate: (callback: (data: { projectId: string; taskId: string; log: string }) => void) => () => void
}

// Extend Window interface
declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
