import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, watch, FSWatcher } from 'fs'
import { v4 as uuidv4 } from 'uuid'

// Types
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
  // Timing fields for state transitions
  startedAt?: string
  verifyingAt?: string
  completedAt?: string
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

// Default state
const defaultSettings: Settings = {
  maxParallelProjects: 3,
  maxTaskAttempts: 3,
  workspacesPath: '',
  claudeExecutable: 'claude'
}

const defaultState: AppState = {
  projects: [],
  settings: defaultSettings
}

class StateManager {
  private dataPath: string
  private statePath: string
  private state: AppState
  private watcher: FSWatcher | null = null
  private saveTimeout: ReturnType<typeof setTimeout> | null = null

  constructor() {
    this.dataPath = join(app.getPath('userData'), 'data')
    this.statePath = join(this.dataPath, 'state.json')

    // Initialize default settings with proper paths
    defaultSettings.workspacesPath = join(app.getPath('userData'), 'workspaces')

    // Ensure data directory exists
    if (!existsSync(this.dataPath)) {
      mkdirSync(this.dataPath, { recursive: true })
    }

    // Load or create state
    this.state = this.loadState()

    // Start watching for external changes
    this.startWatching()
  }

  private loadState(): AppState {
    try {
      if (existsSync(this.statePath)) {
        const data = readFileSync(this.statePath, 'utf-8')
        const parsed = JSON.parse(data) as AppState
        // Merge with defaults to ensure all fields exist
        return {
          projects: parsed.projects || [],
          settings: { ...defaultSettings, ...parsed.settings }
        }
      }
    } catch (error) {
      console.error('Failed to load state:', error)
    }
    return { ...defaultState }
  }

  private saveState(): void {
    // Debounce saves to avoid excessive writes
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout)
    }

    this.saveTimeout = setTimeout(() => {
      try {
        writeFileSync(this.statePath, JSON.stringify(this.state, null, 2))
        this.notifyRenderers()
      } catch (error) {
        console.error('Failed to save state:', error)
      }
    }, 100)
  }

  private startWatching(): void {
    try {
      this.watcher = watch(this.statePath, (eventType) => {
        if (eventType === 'change') {
          // Reload state if changed externally (e.g., by Claude process)
          const newState = this.loadState()
          if (JSON.stringify(newState) !== JSON.stringify(this.state)) {
            this.state = newState
            this.notifyRenderers()
          }
        }
      })
    } catch (error) {
      // File might not exist yet, that's okay
      console.log('State file does not exist yet, will be created on first save')
    }
  }

  private notifyRenderers(): void {
    // Send state update to all renderer windows
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send('state:changed', this.state)
    })
  }

  // Public API
  getState(): AppState {
    return this.state
  }

  setState(newState: AppState): void {
    this.state = newState
    this.saveState()
  }

  getSettings(): Settings {
    return this.state.settings
  }

  updateSettings(updates: Partial<Settings>): Settings {
    this.state.settings = { ...this.state.settings, ...updates }
    this.saveState()
    return this.state.settings
  }

  // Project operations
  getProjects(): Project[] {
    return this.state.projects
  }

  getProject(id: string): Project | undefined {
    return this.state.projects.find((p) => p.id === id)
  }

  createProject(input: {
    name: string
    description: string
    productBrief: string
    solutionBrief: string
    repoUrl: string
    baseBranch: string
  }): Project {
    const now = new Date().toISOString()
    const project: Project = {
      id: uuidv4(),
      ...input,
      workingBranch: `ralph/${input.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
      status: 'idle',
      tasks: [],
      createdAt: now,
      updatedAt: now
    }

    this.state.projects.push(project)
    this.saveState()
    return project
  }

  updateProject(id: string, updates: Partial<Omit<Project, 'id' | 'createdAt'>>): Project | null {
    const index = this.state.projects.findIndex((p) => p.id === id)
    if (index === -1) return null

    this.state.projects[index] = {
      ...this.state.projects[index],
      ...updates,
      updatedAt: new Date().toISOString()
    }

    this.saveState()
    return this.state.projects[index]
  }

  deleteProject(id: string): boolean {
    const index = this.state.projects.findIndex((p) => p.id === id)
    if (index === -1) return false

    this.state.projects.splice(index, 1)
    this.saveState()
    return true
  }

  // Task operations
  getTasks(projectId: string): Task[] {
    const project = this.getProject(projectId)
    return project?.tasks || []
  }

  getTask(projectId: string, taskId: string): Task | undefined {
    const project = this.getProject(projectId)
    return project?.tasks.find((t) => t.id === taskId)
  }

  createTask(
    projectId: string,
    input: {
      title: string
      description: string
      acceptanceCriteria: string[]
      priority?: number
    }
  ): Task | null {
    const project = this.getProject(projectId)
    if (!project) return null

    const now = new Date().toISOString()
    const task: Task = {
      id: uuidv4(),
      title: input.title,
      description: input.description,
      acceptanceCriteria: input.acceptanceCriteria,
      status: 'backlog',
      priority: input.priority ?? project.tasks.length,
      logs: [],
      attempts: 0,
      createdAt: now,
      updatedAt: now
    }

    project.tasks.push(task)
    project.updatedAt = now
    this.saveState()
    return task
  }

  updateTask(
    projectId: string,
    taskId: string,
    updates: Partial<Omit<Task, 'id' | 'createdAt'>>
  ): Task | null {
    const project = this.getProject(projectId)
    if (!project) return null

    const taskIndex = project.tasks.findIndex((t) => t.id === taskId)
    if (taskIndex === -1) return null

    const now = new Date().toISOString()
    project.tasks[taskIndex] = {
      ...project.tasks[taskIndex],
      ...updates,
      updatedAt: now
    }
    project.updatedAt = now

    this.saveState()
    return project.tasks[taskIndex]
  }

  deleteTask(projectId: string, taskId: string): boolean {
    const project = this.getProject(projectId)
    if (!project) return false

    const taskIndex = project.tasks.findIndex((t) => t.id === taskId)
    if (taskIndex === -1) return false

    project.tasks.splice(taskIndex, 1)
    project.updatedAt = new Date().toISOString()
    this.saveState()
    return true
  }

  // Log operations
  addTaskLog(
    projectId: string,
    taskId: string,
    log: Omit<LogEntry, 'timestamp'>
  ): LogEntry | null {
    const task = this.getTask(projectId, taskId)
    if (!task) return null

    const logEntry: LogEntry = {
      ...log,
      timestamp: new Date().toISOString()
    }

    task.logs.push(logEntry)
    this.updateTask(projectId, taskId, { logs: task.logs })
    return logEntry
  }

  // Utility
  getDataPaths(): { data: string; workspaces: string; logs: string } {
    return {
      data: this.dataPath,
      workspaces: this.state.settings.workspacesPath || join(app.getPath('userData'), 'workspaces'),
      logs: join(app.getPath('userData'), 'logs')
    }
  }

  cleanup(): void {
    if (this.watcher) {
      this.watcher.close()
    }
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout)
    }
  }
}

// Singleton instance
let stateManager: StateManager | null = null

export function getStateManager(): StateManager {
  if (!stateManager) {
    stateManager = new StateManager()
  }
  return stateManager
}

export function cleanupStateManager(): void {
  if (stateManager) {
    stateManager.cleanup()
    stateManager = null
  }
}
