import { app, BrowserWindow } from 'electron'
import { join, basename } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, watch, FSWatcher } from 'fs'
import { v4 as uuidv4 } from 'uuid'

// Types
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

// Workspace log entry format for .ralph/logs.json
export interface WorkspaceLogEntry {
  timestamp: string
  iteration: number
  taskId?: string
  action: string
  from?: string
  to?: string
  message: string
}

// Workspace tasks.json structure
export interface WorkspaceTasksData {
  project: {
    id: string
    name: string
    description: string
    productBrief: string
    solutionBrief: string
  }
  tasks: Array<{
    id: string
    title: string
    description: string
    acceptanceCriteria: string[]
    priority: number
    status: TaskStatus
    attempts: number
    startedAt: string | null
    verifyingAt: string | null
    completedAt: string | null
  }>
}

// Workspace logs.json structure
export interface WorkspaceLogsData {
  entries: WorkspaceLogEntry[]
}

export interface Repository {
  id: string
  name: string
  nameWithOwner: string
  url: string
  owner: string
  baseBranch: string
  isPrivate: boolean
  createdAt: string
  updatedAt: string
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
  startedAt?: string
  verifyingAt?: string
  completedAt?: string
}

export interface Project {
  id: string
  repositoryId: string
  name: string
  description: string
  productBrief: string
  solutionBrief: string
  baseBranch: string
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

// Default state
const defaultSettings: Settings = {
  maxParallelProjects: 3,
  maxTaskAttempts: 3,
  workspacesPath: '',
  claudeExecutable: 'claude'
}

const defaultState: AppState = {
  repositories: [],
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parsed = JSON.parse(data) as any

        // Check if migration is needed (old format has repoUrl on projects, no repositories array)
        if (!parsed.repositories && parsed.projects?.length > 0 && parsed.projects[0]?.repoUrl) {
          console.log('Migrating projects to repository structure...')
          return this.migrateToRepositoryStructure(parsed)
        }

        // Merge with defaults to ensure all fields exist
        // Migrate projects to ensure new fields exist
        const migratedProjects = (parsed.projects || []).map((project: Partial<Project>) => ({
          ...project,
          maxIterations: project.maxIterations ?? 50,
          currentIteration: project.currentIteration ?? 0,
          loopLogs: project.loopLogs ?? []
        }))

        return {
          repositories: parsed.repositories || [],
          projects: migratedProjects,
          settings: { ...defaultSettings, ...parsed.settings }
        }
      }
    } catch (error) {
      console.error('Failed to load state:', error)
    }
    return { ...defaultState }
  }

  private migrateToRepositoryStructure(oldState: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    projects: any[]
    settings: Settings
  }): AppState {
    const repoMap = new Map<string, Repository>()
    const migratedProjects: Project[] = []

    for (const project of oldState.projects || []) {
      if (!project.repoUrl) continue

      let repository = repoMap.get(project.repoUrl)

      if (!repository) {
        // Extract repo info from URL
        const { name, owner, nameWithOwner } = this.parseRepoUrl(project.repoUrl)

        repository = {
          id: uuidv4(),
          name,
          nameWithOwner,
          url: project.repoUrl,
          owner,
          baseBranch: project.baseBranch || 'main',
          isPrivate: false, // Unknown during migration
          createdAt: project.createdAt,
          updatedAt: new Date().toISOString()
        }
        repoMap.set(project.repoUrl, repository)
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { repoUrl, ...projectWithoutRepoUrl } = project
      migratedProjects.push({
        ...projectWithoutRepoUrl,
        repositoryId: repository.id
      })
    }

    const migratedState: AppState = {
      repositories: Array.from(repoMap.values()),
      projects: migratedProjects,
      settings: { ...defaultSettings, ...oldState.settings }
    }

    console.log(`Migration complete: created ${repoMap.size} repositories from ${migratedProjects.length} projects`)

    // Save the migrated state
    writeFileSync(this.statePath, JSON.stringify(migratedState, null, 2))

    return migratedState
  }

  private parseRepoUrl(url: string): { name: string; owner: string; nameWithOwner: string } {
    // Handle both HTTPS and SSH URLs
    // https://github.com/owner/repo.git or git@github.com:owner/repo.git
    const httpsMatch = url.match(/github\.com[\/:]([^\/]+)\/([^\/\.]+)(\.git)?/)

    if (httpsMatch) {
      const owner = httpsMatch[1]
      const name = httpsMatch[2]
      return { name, owner, nameWithOwner: `${owner}/${name}` }
    }

    // Fallback for other URL formats
    const parts = url.split('/').filter(Boolean)
    const name = parts[parts.length - 1]?.replace('.git', '') || 'unknown'
    const owner = parts[parts.length - 2] || 'unknown'
    return { name, owner, nameWithOwner: `${owner}/${name}` }
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

  // Repository operations
  getRepositories(): Repository[] {
    return this.state.repositories
  }

  getRepository(id: string): Repository | undefined {
    return this.state.repositories.find((r) => r.id === id)
  }

  getRepositoryByUrl(url: string): Repository | undefined {
    return this.state.repositories.find((r) => r.url === url)
  }

  createRepository(input: {
    name: string
    nameWithOwner: string
    url: string
    owner: string
    baseBranch: string
    isPrivate: boolean
  }): Repository {
    const now = new Date().toISOString()
    const repository: Repository = {
      id: uuidv4(),
      ...input,
      createdAt: now,
      updatedAt: now
    }

    this.state.repositories.push(repository)
    this.saveState()
    return repository
  }

  deleteRepository(id: string): boolean {
    // Check if any projects reference this repository
    const hasProjects = this.state.projects.some((p) => p.repositoryId === id)
    if (hasProjects) {
      throw new Error('Cannot delete repository with existing projects')
    }

    const index = this.state.repositories.findIndex((r) => r.id === id)
    if (index === -1) return false

    this.state.repositories.splice(index, 1)
    this.saveState()
    return true
  }

  // Project operations
  getProjects(): Project[] {
    return this.state.projects
  }

  getProject(id: string): Project | undefined {
    return this.state.projects.find((p) => p.id === id)
  }

  createProject(input: {
    repositoryId: string
    name: string
    description: string
    productBrief: string
    solutionBrief: string
    baseBranch: string
  }): Project {
    const now = new Date().toISOString()
    const project: Project = {
      id: uuidv4(),
      ...input,
      workingBranch: `ralph/${input.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
      status: 'idle',
      tasks: [],
      maxIterations: 50,
      currentIteration: 0,
      loopLogs: [],
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
      status?: TaskStatus
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
      status: input.status ?? 'backlog',
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

  // Loop log operations
  addLoopLog(
    projectId: string,
    iteration: number,
    step: LoopStep,
    message: string,
    taskId?: string,
    details?: string
  ): LoopLogEntry | null {
    const project = this.getProject(projectId)
    if (!project) return null

    const logEntry: LoopLogEntry = {
      id: uuidv4(),
      iteration,
      timestamp: new Date().toISOString(),
      step,
      message,
      ...(taskId && { taskId }),
      ...(details && { details })
    }

    project.loopLogs.push(logEntry)
    project.updatedAt = new Date().toISOString()
    this.saveState()
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

  // Workspace file operations

  /**
   * Extract repo name from URL (e.g., "https://github.com/owner/repo.git" -> "repo")
   */
  private extractRepoName(repoUrl: string): string {
    const name = basename(repoUrl, '.git')
    return name || 'repo'
  }

  /**
   * Get the path to a project's workspace .ralph folder
   * Returns null if the project or repository doesn't exist
   */
  private getWorkspaceRalphPath(projectId: string): string | null {
    const project = this.getProject(projectId)
    if (!project) return null

    const repository = this.getRepository(project.repositoryId)
    if (!repository) return null

    const workspacesPath = this.state.settings.workspacesPath || join(app.getPath('userData'), 'workspaces')
    const repoName = this.extractRepoName(repository.url)
    return join(workspacesPath, projectId, repoName, '.ralph')
  }

  /**
   * Get the path to .ralph/tasks.json for a project
   * Returns null if the workspace doesn't exist
   */
  getWorkspaceTasksPath(projectId: string): string | null {
    const ralphPath = this.getWorkspaceRalphPath(projectId)
    if (!ralphPath) return null

    const tasksPath = join(ralphPath, 'tasks.json')
    if (!existsSync(tasksPath)) return null

    return tasksPath
  }

  /**
   * Get the path to .ralph/logs.json for a project
   * Returns null if the workspace doesn't exist
   */
  getWorkspaceLogsPath(projectId: string): string | null {
    const ralphPath = this.getWorkspaceRalphPath(projectId)
    if (!ralphPath) return null

    const logsPath = join(ralphPath, 'logs.json')
    if (!existsSync(logsPath)) return null

    return logsPath
  }

  /**
   * Read and parse tasks.json from workspace
   * Returns null if file doesn't exist or is invalid
   */
  readWorkspaceTasks(projectId: string): WorkspaceTasksData | null {
    const tasksPath = this.getWorkspaceTasksPath(projectId)
    if (!tasksPath) return null

    try {
      const content = readFileSync(tasksPath, 'utf-8')
      return JSON.parse(content) as WorkspaceTasksData
    } catch (error) {
      console.error(`Failed to read workspace tasks for project ${projectId}:`, error)
      return null
    }
  }

  /**
   * Write tasks data to workspace tasks.json
   * Returns true on success, false on failure
   */
  writeWorkspaceTasks(projectId: string, data: WorkspaceTasksData): boolean {
    const ralphPath = this.getWorkspaceRalphPath(projectId)
    if (!ralphPath) return false

    const tasksPath = join(ralphPath, 'tasks.json')

    try {
      // Ensure .ralph directory exists
      if (!existsSync(ralphPath)) {
        mkdirSync(ralphPath, { recursive: true })
      }

      writeFileSync(tasksPath, JSON.stringify(data, null, 2), 'utf-8')
      return true
    } catch (error) {
      console.error(`Failed to write workspace tasks for project ${projectId}:`, error)
      return false
    }
  }

  /**
   * Read and parse logs.json from workspace
   * Returns null if file doesn't exist or is invalid
   */
  readWorkspaceLogs(projectId: string): WorkspaceLogsData | null {
    const logsPath = this.getWorkspaceLogsPath(projectId)
    if (!logsPath) return null

    try {
      const content = readFileSync(logsPath, 'utf-8')
      return JSON.parse(content) as WorkspaceLogsData
    } catch (error) {
      console.error(`Failed to read workspace logs for project ${projectId}:`, error)
      return null
    }
  }

  /**
   * Append a log entry to workspace logs.json
   * Returns true on success, false on failure
   */
  appendWorkspaceLog(projectId: string, entry: WorkspaceLogEntry): boolean {
    const ralphPath = this.getWorkspaceRalphPath(projectId)
    if (!ralphPath) return false

    const logsPath = join(ralphPath, 'logs.json')

    try {
      // Ensure .ralph directory exists
      if (!existsSync(ralphPath)) {
        mkdirSync(ralphPath, { recursive: true })
      }

      // Read existing logs or create new structure
      let logsData: WorkspaceLogsData = { entries: [] }
      if (existsSync(logsPath)) {
        try {
          const content = readFileSync(logsPath, 'utf-8')
          logsData = JSON.parse(content) as WorkspaceLogsData
        } catch {
          // If parsing fails, start with empty entries
          logsData = { entries: [] }
        }
      }

      // Append the new entry
      logsData.entries.push(entry)

      // Write back
      writeFileSync(logsPath, JSON.stringify(logsData, null, 2), 'utf-8')
      return true
    } catch (error) {
      console.error(`Failed to append workspace log for project ${projectId}:`, error)
      return false
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
