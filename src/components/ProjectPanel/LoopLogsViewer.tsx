import { useState, useMemo, useEffect, useCallback } from 'react'
import type { LoopLogEntry } from '../../types'

interface LoopLogsViewerProps {
  projectId: string
  currentIteration: number
  maxIterations: number
  isRunning?: boolean
}

// Action type styling configuration for workspace logs
// Maps action types to visual styles
type ActionType = 'status_change' | 'commit' | 'verification' | 'error' | 'default'

const actionConfig: Record<ActionType, { color: string; bgColor: string; darkBgColor: string; icon: JSX.Element }> = {
  status_change: {
    color: 'text-blue-700 dark:text-blue-300',
    bgColor: 'bg-blue-100',
    darkBgColor: 'dark:bg-blue-900/50',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    )
  },
  commit: {
    color: 'text-amber-700 dark:text-amber-300',
    bgColor: 'bg-amber-100',
    darkBgColor: 'dark:bg-amber-900/50',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    )
  },
  verification: {
    color: 'text-purple-700 dark:text-purple-300',
    bgColor: 'bg-purple-100',
    darkBgColor: 'dark:bg-purple-900/50',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  },
  error: {
    color: 'text-red-700 dark:text-red-300',
    bgColor: 'bg-red-100',
    darkBgColor: 'dark:bg-red-900/50',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    )
  },
  default: {
    color: 'text-green-700 dark:text-green-300',
    bgColor: 'bg-green-100',
    darkBgColor: 'dark:bg-green-900/50',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    )
  }
}

// Get action type for styling (normalize action string to known types)
function getActionType(action: string): ActionType {
  const normalizedAction = action.toLowerCase()
  if (normalizedAction === 'status_change') return 'status_change'
  if (normalizedAction === 'commit') return 'commit'
  if (normalizedAction === 'verification') return 'verification'
  if (normalizedAction === 'error') return 'error'
  return 'default'
}

// Determine if a log entry indicates failure/error
function isFailureEntry(entry: LoopLogEntry): boolean {
  if (entry.action === 'error') return true
  const lowerMessage = entry.message.toLowerCase()
  return lowerMessage.includes('fail') || lowerMessage.includes('error') || lowerMessage.includes('block')
}

// Format timestamp to relative or short time
function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`

  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Generate a unique key for a log entry (since new format doesn't have id)
function getLogEntryKey(entry: LoopLogEntry, index: number): string {
  return `${entry.iteration}-${entry.timestamp}-${index}`
}

interface LogEntryRowProps {
  entry: LoopLogEntry
}

function LogEntryRow({ entry }: LogEntryRowProps) {
  const isFailure = isFailureEntry(entry)

  // Get styling config based on action type
  const actionType = getActionType(entry.action)
  const config = actionConfig[isFailure ? 'error' : actionType]
  const colorClass = config.color
  const bgClass = `${config.bgColor} ${config.darkBgColor}`
  const icon = config.icon

  // Format status transition if present
  const statusTransition = entry.from && entry.to ? `${entry.from} → ${entry.to}` : null

  return (
    <div className="py-2 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
      <div className="flex items-start gap-2">
        {/* Action badge */}
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${bgClass} ${colorClass} shrink-0`}>
          {icon}
          <span className="hidden sm:inline">{entry.action.replace('_', ' ')}</span>
        </span>

        {/* Message and details */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-700 dark:text-gray-300 break-words">
            {entry.message}
          </p>
          {statusTransition && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Status: {statusTransition}
            </p>
          )}
          {entry.taskId && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Task: {entry.taskId}
            </p>
          )}
        </div>

        {/* Timestamp */}
        <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
          {formatTimestamp(entry.timestamp)}
        </span>
      </div>
    </div>
  )
}

interface IterationGroupProps {
  iteration: number
  entries: LoopLogEntry[]
  isExpanded: boolean
  onToggle: () => void
}

function IterationGroup({ iteration, entries, isExpanded, onToggle }: IterationGroupProps) {
  // Get the latest entry for summary
  const latestEntry = entries[0]
  const hasFailure = entries.some(isFailureEntry)

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg mb-2 overflow-hidden">
      {/* Iteration header */}
      <button
        onClick={onToggle}
        className="w-full px-3 py-2 flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Iteration {iteration}
          </span>
          {hasFailure && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300">
              Failed
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span>{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</span>
          {latestEntry && (
            <span>{formatTimestamp(latestEntry.timestamp)}</span>
          )}
        </div>
      </button>

      {/* Entries list */}
      {isExpanded && (
        <div className="px-3 bg-white dark:bg-gray-800">
          {entries.map((entry, index) => (
            <LogEntryRow key={getLogEntryKey(entry, index)} entry={entry} />
          ))}
        </div>
      )}
    </div>
  )
}

// Check if we're running in Electron
const isElectron = () => typeof window !== 'undefined' && window.electronAPI !== undefined

export function LoopLogsViewer({ projectId, currentIteration, maxIterations, isRunning = false }: LoopLogsViewerProps) {
  const [logs, setLogs] = useState<LoopLogEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Fetch logs from workspace via IPC
  const fetchLogs = useCallback(async () => {
    if (!isElectron()) {
      setIsLoading(false)
      return
    }

    try {
      const workspaceLogs = await window.electronAPI.getWorkspaceLogs(projectId)
      setLogs(workspaceLogs)
    } catch (error) {
      console.error('Failed to fetch workspace logs:', error)
      setLogs([])
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  // Fetch logs on mount and when projectId changes
  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  // Poll logs every second when project is running
  useEffect(() => {
    if (!isRunning || !isElectron()) return

    const pollInterval = setInterval(() => {
      fetchLogs()
    }, 1000)

    return () => clearInterval(pollInterval)
  }, [isRunning, fetchLogs])

  // Subscribe to workspace logs changes
  useEffect(() => {
    if (!isElectron()) return

    const unsubscribe = window.electronAPI.onWorkspaceLogsChange((data) => {
      if (data.projectId === projectId) {
        // Re-fetch logs when workspace logs change
        fetchLogs()
      }
    })

    // Also listen for state changes (which include file watcher updates)
    const unsubscribeState = window.electronAPI.onStateChange(() => {
      // Re-fetch logs when state changes (file watcher may have detected changes)
      fetchLogs()
    })

    return () => {
      unsubscribe()
      unsubscribeState()
    }
  }, [projectId, fetchLogs])

  // Group logs by iteration
  const groupedLogs = useMemo(() => {
    const groups = new Map<number, LoopLogEntry[]>()

    // Sort by timestamp descending within groups
    const sortedLogs = [...logs].sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )

    for (const log of sortedLogs) {
      const existing = groups.get(log.iteration) || []
      existing.push(log)
      groups.set(log.iteration, existing)
    }

    // Sort iterations descending (newest first)
    return Array.from(groups.entries()).sort((a, b) => b[0] - a[0])
  }, [logs])

  // Track which iterations are expanded (default: latest iteration)
  const latestIteration = groupedLogs.length > 0 ? groupedLogs[0][0] : null
  const [expandedIterations, setExpandedIterations] = useState<Set<number>>(() => {
    return latestIteration !== null ? new Set([latestIteration]) : new Set()
  })

  // Update expanded state when new iteration arrives
  useEffect(() => {
    if (latestIteration !== null) {
      setExpandedIterations(prev => {
        if (!prev.has(latestIteration)) {
          return new Set([latestIteration])
        }
        return prev
      })
    }
  }, [latestIteration])

  const toggleIteration = (iteration: number) => {
    setExpandedIterations(prev => {
      const next = new Set(prev)
      if (next.has(iteration)) {
        next.delete(iteration)
      } else {
        next.add(iteration)
      }
      return next
    })
  }

  // Calculate progress percentage
  const progressPercent = maxIterations > 0 ? Math.min((currentIteration / maxIterations) * 100, 100) : 0

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div className="w-8 h-8 border-2 border-ralph-500 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Loading logs...
        </p>
      </div>
    )
  }

  // Empty state
  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <svg
          className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No logs yet. Start the project to see progress.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Progress bar section */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
            Progress
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {currentIteration} / {maxIterations} iterations
          </span>
        </div>
        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-ralph-500 rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Logs list */}
      <div className="flex-1 overflow-y-auto p-4">
        {groupedLogs.map(([iteration, entries]) => (
          <IterationGroup
            key={iteration}
            iteration={iteration}
            entries={entries}
            isExpanded={expandedIterations.has(iteration)}
            onToggle={() => toggleIteration(iteration)}
          />
        ))}
      </div>
    </div>
  )
}
