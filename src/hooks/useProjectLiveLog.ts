import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * Hook to subscribe to live log updates from all Claude processes for a project.
 * Unlike useLiveLog which filters by taskId, this captures all output for the project.
 * Only subscribes when `enabled` is true, but preserves content when disabled.
 */
export function useProjectLiveLog(projectId: string, enabled: boolean) {
  const [liveContent, setLiveContent] = useState('')
  const previousProjectId = useRef(projectId)

  // Only clear content when project changes (not when disabled)
  useEffect(() => {
    if (projectId !== previousProjectId.current) {
      setLiveContent('')
      previousProjectId.current = projectId
    }
  }, [projectId])

  // Subscribe to log updates for all tasks in this project
  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !window.electronAPI) {
      return
    }

    const unsubscribe = window.electronAPI.onLogUpdate((data) => {
      if (data.projectId === projectId) {
        setLiveContent((prev) => prev + data.log)
      }
    })

    return unsubscribe
  }, [projectId, enabled])

  const clear = useCallback(() => {
    setLiveContent('')
  }, [])

  return { liveContent, clear }
}
