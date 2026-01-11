import { useState, useEffect, useCallback } from 'react'

/**
 * Hook to subscribe to live log updates from the Electron main process.
 * Only subscribes when `enabled` is true.
 */
export function useLiveLog(projectId: string, taskId: string, enabled: boolean) {
  const [liveContent, setLiveContent] = useState('')

  // Clear content when task changes or becomes disabled
  useEffect(() => {
    if (!enabled) {
      setLiveContent('')
    }
  }, [enabled, projectId, taskId])

  // Subscribe to log updates
  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !window.electronAPI) {
      return
    }

    const unsubscribe = window.electronAPI.onLogUpdate((data) => {
      if (data.projectId === projectId && data.taskId === taskId) {
        setLiveContent((prev) => prev + data.log)
      }
    })

    return unsubscribe
  }, [projectId, taskId, enabled])

  const clear = useCallback(() => {
    setLiveContent('')
  }, [])

  return { liveContent, clear }
}
