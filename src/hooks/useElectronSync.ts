import { useEffect, useCallback, useState } from 'react'
import { useProjectStore } from '../stores/projectStore'
import type { AppState, GitHubRepo, CreateRepositoryInput } from '../types'

// Check if we're running in Electron (evaluated at runtime, not module load)
const isElectron = () => typeof window !== 'undefined' && window.electronAPI !== undefined

export function useElectronSync() {
  const { setRepositories, setProjects, setSettings, setLoading, setError } = useProjectStore()

  // Load initial state from Electron
  const loadState = useCallback(async () => {
    if (!isElectron()) return

    try {
      setLoading(true)
      const state = await window.electronAPI.getState()
      if (state) {
        setRepositories(state.repositories || [])
        setProjects(state.projects || [])
        setSettings(state.settings)
      }
    } catch (error) {
      console.error('Failed to load state from Electron:', error)
      setError('Failed to load state')
    } finally {
      setLoading(false)
    }
  }, [setRepositories, setProjects, setSettings, setLoading, setError])

  // Subscribe to state changes from main process
  useEffect(() => {
    if (!isElectron()) return

    loadState()

    // Listen for state changes from main process (e.g., from file watcher)
    const unsubscribe = window.electronAPI.onStateChange((state: AppState) => {
      setRepositories(state.repositories || [])
      setProjects(state.projects || [])
      setSettings(state.settings)
    })

    return () => {
      unsubscribe()
    }
  }, [loadState, setRepositories, setProjects, setSettings])

  return { isElectron, loadState }
}

// Hook for project operations that sync with Electron
export function useElectronProjects() {
  const store = useProjectStore()

  const createProject = useCallback(
    async (input: Parameters<typeof store.addProject>[0]) => {
      if (isElectron()) {
        try {
          const project = await window.electronAPI.createProject(input)
          // Store will be updated via state change event
          return project
        } catch (error) {
          console.error('Failed to create project:', error)
          throw error
        }
      } else {
        return store.addProject(input)
      }
    },
    [store]
  )

  const updateProject = useCallback(
    async (id: string, updates: Parameters<typeof store.updateProject>[1]) => {
      if (isElectron()) {
        try {
          await window.electronAPI.updateProject(id, updates)
          // Store will be updated via state change event
        } catch (error) {
          console.error('Failed to update project:', error)
          throw error
        }
      } else {
        store.updateProject(id, updates)
      }
    },
    [store]
  )

  const deleteProject = useCallback(
    async (id: string) => {
      if (isElectron()) {
        try {
          await window.electronAPI.deleteProject(id)
          // Store will be updated via state change event
        } catch (error) {
          console.error('Failed to delete project:', error)
          throw error
        }
      } else {
        store.deleteProject(id)
      }
    },
    [store]
  )

  const startProject = useCallback(async (id: string) => {
    if (isElectron()) {
      try {
        await window.electronAPI.startProject(id)
      } catch (error) {
        console.error('Failed to start project:', error)
        throw error
      }
    } else {
      store.updateProject(id, { status: 'running' })
    }
  }, [store])

  const stopProject = useCallback(async (id: string) => {
    if (isElectron()) {
      try {
        await window.electronAPI.stopProject(id)
      } catch (error) {
        console.error('Failed to stop project:', error)
        throw error
      }
    } else {
      store.updateProject(id, { status: 'idle' })
    }
  }, [store])

  return {
    ...store,
    createProject,
    updateProject,
    deleteProject,
    startProject,
    stopProject
  }
}

// Hook for repository operations that sync with Electron
export function useElectronRepositories() {
  const store = useProjectStore()
  const [isLoadingGitHub, setIsLoadingGitHub] = useState(false)
  const [gitHubRepos, setGitHubRepos] = useState<GitHubRepo[]>([])
  const [gitHubError, setGitHubError] = useState<string | null>(null)

  const fetchGitHubRepos = useCallback(async () => {
    if (!isElectron()) return []

    setIsLoadingGitHub(true)
    setGitHubError(null)
    try {
      const repos = await window.electronAPI.listGitHubRepos()
      setGitHubRepos(repos)
      return repos
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch GitHub repositories'
      console.error('Failed to fetch GitHub repos:', error)
      setGitHubError(message)
      return []
    } finally {
      setIsLoadingGitHub(false)
    }
  }, [])

  const createRepository = useCallback(
    async (input: CreateRepositoryInput) => {
      if (isElectron()) {
        try {
          const repository = await window.electronAPI.createRepository(input)
          // Store will be updated via state change event
          return repository
        } catch (error) {
          console.error('Failed to create repository:', error)
          throw error
        }
      } else {
        return store.addRepository(input)
      }
    },
    [store]
  )

  const deleteRepository = useCallback(
    async (id: string) => {
      if (isElectron()) {
        try {
          await window.electronAPI.deleteRepository(id)
          // Store will be updated via state change event
        } catch (error) {
          console.error('Failed to delete repository:', error)
          throw error
        }
      } else {
        store.deleteRepository(id)
      }
    },
    [store]
  )

  return {
    ...store,
    isLoadingGitHub,
    gitHubRepos,
    gitHubError,
    fetchGitHubRepos,
    createRepository,
    deleteRepository
  }
}

// Hook for task operations that sync with Electron
export function useElectronTasks() {
  const store = useProjectStore()

  const createTask = useCallback(
    async (projectId: string, input: Parameters<typeof store.addTask>[1]) => {
      if (isElectron()) {
        try {
          const task = await window.electronAPI.createTask(projectId, input)
          // Store will be updated via state change event
          return task
        } catch (error) {
          console.error('Failed to create task:', error)
          throw error
        }
      } else {
        return store.addTask(projectId, input)
      }
    },
    [store]
  )

  const updateTask = useCallback(
    async (
      projectId: string,
      taskId: string,
      updates: Parameters<typeof store.updateTask>[2]
    ) => {
      if (isElectron()) {
        try {
          await window.electronAPI.updateTask(projectId, taskId, updates)
          // Store will be updated via state change event
        } catch (error) {
          console.error('Failed to update task:', error)
          throw error
        }
      } else {
        store.updateTask(projectId, taskId, updates)
      }
    },
    [store]
  )

  const deleteTask = useCallback(
    async (projectId: string, taskId: string) => {
      if (isElectron()) {
        try {
          await window.electronAPI.deleteTask(projectId, taskId)
          // Store will be updated via state change event
        } catch (error) {
          console.error('Failed to delete task:', error)
          throw error
        }
      } else {
        store.deleteTask(projectId, taskId)
      }
    },
    [store]
  )

  const getTaskLogs = useCallback(async (projectId: string, taskId: string) => {
    if (isElectron()) {
      try {
        return await window.electronAPI.getTaskLogs(projectId, taskId)
      } catch (error) {
        console.error('Failed to get task logs:', error)
        return ''
      }
    }
    return ''
  }, [])

  return {
    ...store,
    createTask,
    updateTask,
    deleteTask,
    getTaskLogs
  }
}
