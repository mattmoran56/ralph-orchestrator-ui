import { useState, useEffect, useRef, useCallback } from 'react'
import { useProjectStore } from '../../stores/projectStore'
import { useElectronTasks } from '../../hooks/useElectronSync'
import { useLiveLog } from '../../hooks/useLiveLog'
import { MarkdownEditor } from '../Editor/MarkdownEditor'
import { TaskTimer } from './TaskTimer'
import { LogViewer } from './LogViewer'
import type { Task } from '../../types'

interface TaskDetailProps {
  projectId: string
  taskId: string
  onClose: () => void
}

export function TaskDetail({ projectId, taskId, onClose }: TaskDetailProps) {
  const { getTask } = useProjectStore()
  const { updateTask, deleteTask, getTaskLogs } = useElectronTasks()
  const task = getTask(projectId, taskId)

  const [width, setWidth] = useState(480)
  const [isResizing, setIsResizing] = useState(false)
  const [showLogs, setShowLogs] = useState(false)
  const [logContent, setLogContent] = useState<string>('')
  const [loadingLogs, setLoadingLogs] = useState(false)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Local state for editable fields
  const [title, setTitle] = useState(task?.title || '')
  const [description, setDescription] = useState(task?.description || '')
  const [criteria, setCriteria] = useState(task?.acceptanceCriteria.join('\n') || '')

  // Check if task is currently active (running)
  const isTaskActive = task?.status === 'in_progress' || task?.status === 'verifying'

  // Subscribe to live logs when task is active
  const { liveContent } = useLiveLog(projectId, taskId, isTaskActive)

  // Sync local state when task changes
  useEffect(() => {
    if (task) {
      setTitle(task.title)
      setDescription(task.description)
      setCriteria(task.acceptanceCriteria.join('\n'))
    }
  }, [task])

  // Auto-save with debounce
  const saveChanges = useCallback(
    (updates: Partial<Task>) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
      saveTimeoutRef.current = setTimeout(() => {
        updateTask(projectId, taskId, updates)
      }, 500)
    },
    [projectId, taskId, updateTask]
  )

  // Handle resize
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return
      const newWidth = window.innerWidth - e.clientX
      setWidth(Math.min(Math.max(320, newWidth), 800))
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing])

  // Cleanup save timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  // Auto-show logs when task becomes active
  useEffect(() => {
    if (isTaskActive) {
      setShowLogs(true)
    }
  }, [isTaskActive])

  // Load log content from file when showing logs for completed tasks
  useEffect(() => {
    if (showLogs && task && !isTaskActive && task.logs.length > 0) {
      setLoadingLogs(true)
      getTaskLogs(projectId, taskId)
        .then((content) => setLogContent(content))
        .finally(() => setLoadingLogs(false))
    }
  }, [showLogs, task, projectId, taskId, getTaskLogs, isTaskActive])

  if (!task) {
    return null
  }

  const handleCriteriaChange = (value: string) => {
    setCriteria(value)
    saveChanges({
      acceptanceCriteria: value
        .split('\n')
        .map((c) => c.trim())
        .filter(Boolean)
    })
  }

  return (
    <div
      ref={sidebarRef}
      className="fixed top-0 right-0 bottom-0 bg-white dark:bg-gray-800 z-40 flex flex-col border-l border-gray-200 dark:border-gray-700"
      style={{
        width,
        boxShadow: '-8px 0 30px -5px rgba(0, 0, 0, 0.15)'
      }}
    >
      {/* Resize handle */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-ralph-500 transition-colors ${
          isResizing ? 'bg-ralph-500' : 'bg-transparent'
        }`}
        onMouseDown={handleMouseDown}
      />

      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Task Details
          </h2>
          <span className={`status-badge ${task.status.replace('_', '-')}`}>
            {task.status.replace('_', ' ')}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 rounded"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Title */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              saveChanges({ title: e.target.value })
            }}
            className="input text-sm"
            placeholder="Task title"
          />
        </div>

        {/* Timer */}
        {task.startedAt && (
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <TaskTimer task={task} />
          </div>
        )}

        {/* Description */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            Description
          </label>
          <div className="min-h-[100px]">
            <MarkdownEditor
              value={description}
              onChange={(value) => {
                setDescription(value)
                saveChanges({ description: value })
              }}
              placeholder="Add a description... Type # for headings, - for lists"
            />
          </div>
        </div>

        {/* Acceptance Criteria */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            Acceptance Criteria
          </label>
          <div className="min-h-[100px]">
            <MarkdownEditor
              value={criteria}
              onChange={handleCriteriaChange}
              placeholder="Add acceptance criteria... Use - for each criterion"
            />
          </div>
        </div>

        {/* Stats */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
              <div className="text-xs text-gray-500 dark:text-gray-400">Attempts</div>
              <div className="text-lg font-medium">{task.attempts}</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
              <div className="text-xs text-gray-500 dark:text-gray-400">Logs</div>
              <div className="text-lg font-medium">{task.logs.length}</div>
            </div>
          </div>
        </div>

        {/* Live Logs Section (when task is active) */}
        {isTaskActive && (
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
              Live Output
            </h4>
            <LogViewer
              logContent={liveContent || 'Waiting for output...'}
              isLive={true}
              resizable={true}
              defaultHeight={400}
              minHeight={200}
              maxHeight={700}
            />
          </div>
        )}

        {/* Execution Logs Section (historical logs) */}
        {task.logs.length > 0 && !isTaskActive && (
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setShowLogs(!showLogs)}
              className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 mb-2"
            >
              <svg
                className={`w-4 h-4 transition-transform ${showLogs ? 'rotate-90' : ''}`}
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              Execution Logs ({task.logs.length})
            </button>
            {showLogs && (
              <div className="space-y-3">
                {/* Log viewer for most recent log */}
                {logContent && (
                  <LogViewer
                    logContent={logContent}
                    title="Latest Log"
                    resizable={true}
                    defaultHeight={350}
                    minHeight={150}
                    maxHeight={600}
                  />
                )}
                {loadingLogs && (
                  <div className="text-sm text-gray-500">Loading logs...</div>
                )}
                {/* Log summaries */}
                <div className="space-y-2">
                  {task.logs.map((log, index) => (
                    <div
                      key={index}
                      className={`p-3 rounded-lg border ${
                        log.success
                          ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
                          : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500 dark:text-gray-400">
                          {new Date(log.timestamp).toLocaleString()}
                        </span>
                        <span
                          className={
                            log.success
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-red-600 dark:text-red-400'
                          }
                        >
                          {log.success ? 'Success' : 'Failed'}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                        {log.summary}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="p-4">
          <button
            onClick={async () => {
              if (confirm('Are you sure you want to delete this task?')) {
                await deleteTask(projectId, taskId)
                onClose()
              }
            }}
            className="btn-danger w-full"
          >
            Delete Task
          </button>
        </div>
      </div>
    </div>
  )
}
