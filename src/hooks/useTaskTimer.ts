import { useState, useEffect } from 'react'
import type { Task } from '../types'

export interface TaskTimerResult {
  inProgressDuration: number | null  // ms since started, null if not started
  verifyingDuration: number | null   // ms since verifying, null if not verifying
  totalDuration: number | null       // ms from start to completion, null if not complete
  isRunning: boolean                 // true if timer is actively ticking
}

/**
 * Hook to calculate and track task duration in real-time.
 * Returns duration values in milliseconds.
 */
export function useTaskTimer(task: Task | null | undefined): TaskTimerResult {
  const [now, setNow] = useState(Date.now())

  const isActive = task?.status === 'in_progress' || task?.status === 'verifying'

  // Tick every second when task is active
  useEffect(() => {
    if (!isActive) return

    const interval = setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => clearInterval(interval)
  }, [isActive])

  if (!task) {
    return {
      inProgressDuration: null,
      verifyingDuration: null,
      totalDuration: null,
      isRunning: false
    }
  }

  const { startedAt, verifyingAt, completedAt, status } = task

  // Calculate in-progress duration
  let inProgressDuration: number | null = null
  if (startedAt) {
    const startTime = new Date(startedAt).getTime()
    if (verifyingAt) {
      // Task has moved to verifying - in_progress duration is fixed
      inProgressDuration = new Date(verifyingAt).getTime() - startTime
    } else if (completedAt && status !== 'in_progress') {
      // Task completed without verifying phase (e.g., blocked during in_progress)
      inProgressDuration = new Date(completedAt).getTime() - startTime
    } else if (status === 'in_progress') {
      // Still in progress - calculate live duration
      inProgressDuration = now - startTime
    } else {
      // Some other completed state
      inProgressDuration = new Date(task.updatedAt).getTime() - startTime
    }
  }

  // Calculate verifying duration
  let verifyingDuration: number | null = null
  if (verifyingAt) {
    const verifyStartTime = new Date(verifyingAt).getTime()
    if (completedAt) {
      // Verification complete - duration is fixed
      verifyingDuration = new Date(completedAt).getTime() - verifyStartTime
    } else if (status === 'verifying') {
      // Still verifying - calculate live duration
      verifyingDuration = now - verifyStartTime
    }
  }

  // Calculate total duration (only when completed)
  let totalDuration: number | null = null
  if (startedAt && completedAt && (status === 'done' || status === 'blocked')) {
    totalDuration = new Date(completedAt).getTime() - new Date(startedAt).getTime()
  }

  return {
    inProgressDuration,
    verifyingDuration,
    totalDuration,
    isRunning: isActive
  }
}

/**
 * Format milliseconds into a human-readable duration string.
 * Examples: "0s", "45s", "2m 30s", "1h 15m 30s"
 */
export function formatDuration(ms: number | null): string {
  if (ms === null) return '--'

  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  const s = seconds % 60
  const m = minutes % 60
  const h = hours

  if (h > 0) {
    return `${h}h ${m}m ${s}s`
  } else if (m > 0) {
    return `${m}m ${s}s`
  } else {
    return `${s}s`
  }
}
