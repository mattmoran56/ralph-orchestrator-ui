import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type { Project, Task, Repository, CreateProjectInput, CreateTaskInput, CreateRepositoryInput, UpdateProjectInput, UpdateTaskInput, Settings } from '../types'

interface ProjectStore {
  // State
  repositories: Repository[]
  projects: Project[]
  settings: Settings
  selectedProjectId: string | null
  selectedTaskId: string | null
  isLoading: boolean
  error: string | null

  // Actions
  setRepositories: (repositories: Repository[]) => void
  setProjects: (projects: Project[]) => void
  setSettings: (settings: Settings) => void
  selectProject: (projectId: string | null) => void
  selectTask: (taskId: string | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void

  // Repository CRUD
  addRepository: (input: CreateRepositoryInput) => Repository
  deleteRepository: (id: string) => void
  getRepository: (id: string) => Repository | undefined
  getProjectsForRepository: (repositoryId: string) => Project[]

  // Project CRUD
  addProject: (input: CreateProjectInput) => Project
  updateProject: (id: string, updates: UpdateProjectInput) => void
  deleteProject: (id: string) => void
  getProject: (id: string) => Project | undefined

  // Task CRUD
  addTask: (projectId: string, input: CreateTaskInput) => Task | undefined
  updateTask: (projectId: string, taskId: string, updates: UpdateTaskInput) => void
  deleteTask: (projectId: string, taskId: string) => void
  getTask: (projectId: string, taskId: string) => Task | undefined

  // Convenience getters
  getSelectedProject: () => Project | undefined
  getSelectedTask: () => Task | undefined
}

const defaultSettings: Settings = {
  maxParallelProjects: 3,
  maxTaskAttempts: 3,
  workspacesPath: '',
  claudeExecutable: 'claude'
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  // Initial state
  repositories: [],
  projects: [],
  settings: defaultSettings,
  selectedProjectId: null,
  selectedTaskId: null,
  isLoading: false,
  error: null,

  // State setters
  setRepositories: (repositories) => set({ repositories }),
  setProjects: (projects) => set({ projects }),
  setSettings: (settings) => set({ settings }),
  selectProject: (projectId) => set({ selectedProjectId: projectId, selectedTaskId: null }),
  selectTask: (taskId) => set({ selectedTaskId: taskId }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),

  // Repository CRUD
  addRepository: (input) => {
    const now = new Date().toISOString()
    const newRepository: Repository = {
      id: uuidv4(),
      ...input,
      createdAt: now,
      updatedAt: now
    }

    set((state) => ({
      repositories: [...state.repositories, newRepository]
    }))

    return newRepository
  },

  deleteRepository: (id) => {
    set((state) => ({
      repositories: state.repositories.filter((r) => r.id !== id)
    }))
  },

  getRepository: (id) => {
    return get().repositories.find((r) => r.id === id)
  },

  getProjectsForRepository: (repositoryId) => {
    return get().projects.filter((p) => p.repositoryId === repositoryId)
  },

  // Project CRUD
  addProject: (input) => {
    const now = new Date().toISOString()
    const newProject: Project = {
      id: uuidv4(),
      ...input,
      workingBranch: `ralph/${input.name.toLowerCase().replace(/\s+/g, '-')}`,
      status: 'idle',
      tasks: [],
      maxIterations: 10,
      currentIteration: 0,
      loopLogs: [],
      createdAt: now,
      updatedAt: now
    }

    set((state) => ({
      projects: [...state.projects, newProject]
    }))

    return newProject
  },

  updateProject: (id, updates) => {
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === id
          ? { ...p, ...updates, updatedAt: new Date().toISOString() }
          : p
      )
    }))
  },

  deleteProject: (id) => {
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      selectedProjectId: state.selectedProjectId === id ? null : state.selectedProjectId,
      selectedTaskId: state.selectedProjectId === id ? null : state.selectedTaskId
    }))
  },

  getProject: (id) => {
    return get().projects.find((p) => p.id === id)
  },

  // Task CRUD
  addTask: (projectId, input) => {
    const now = new Date().toISOString()
    const project = get().projects.find((p) => p.id === projectId)
    if (!project) return undefined

    const newTask: Task = {
      id: uuidv4(),
      ...input,
      status: 'backlog',
      priority: input.priority ?? project.tasks.length,
      logs: [],
      attempts: 0,
      createdAt: now,
      updatedAt: now
    }

    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId
          ? { ...p, tasks: [...p.tasks, newTask], updatedAt: now }
          : p
      )
    }))

    return newTask
  },

  updateTask: (projectId, taskId, updates) => {
    const now = new Date().toISOString()
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              tasks: p.tasks.map((t) =>
                t.id === taskId
                  ? { ...t, ...updates, updatedAt: now }
                  : t
              ),
              updatedAt: now
            }
          : p
      )
    }))
  },

  deleteTask: (projectId, taskId) => {
    const now = new Date().toISOString()
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              tasks: p.tasks.filter((t) => t.id !== taskId),
              updatedAt: now
            }
          : p
      ),
      selectedTaskId: state.selectedTaskId === taskId ? null : state.selectedTaskId
    }))
  },

  getTask: (projectId, taskId) => {
    const project = get().projects.find((p) => p.id === projectId)
    return project?.tasks.find((t) => t.id === taskId)
  },

  // Convenience getters
  getSelectedProject: () => {
    const { selectedProjectId, projects } = get()
    return selectedProjectId ? projects.find((p) => p.id === selectedProjectId) : undefined
  },

  getSelectedTask: () => {
    const { selectedProjectId, selectedTaskId, projects } = get()
    if (!selectedProjectId || !selectedTaskId) return undefined
    const project = projects.find((p) => p.id === selectedProjectId)
    return project?.tasks.find((t) => t.id === selectedTaskId)
  }
}))
