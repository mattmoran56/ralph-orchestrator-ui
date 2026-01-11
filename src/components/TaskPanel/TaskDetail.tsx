import { useState, useEffect } from 'react'
import { useProjectStore } from '../../stores/projectStore'
import { useElectronTasks } from '../../hooks/useElectronSync'
import { useLiveLog } from '../../hooks/useLiveLog'
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
  const [isEditing, setIsEditing] = useState(false)
  const [showLogs, setShowLogs] = useState(false)
  const [logContent, setLogContent] = useState<string>('')
  const [loadingLogs, setLoadingLogs] = useState(false)

  // Check if task is currently active (running)
  const isTaskActive = task?.status === 'in_progress' || task?.status === 'verifying'

  // Subscribe to live logs when task is active
  const { liveContent } = useLiveLog(projectId, taskId, isTaskActive)

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
    return (
      <div className="p-4">
        <p className="text-gray-500">Task not found</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <h2 className="text-lg font-semibold truncate">Task Details</h2>
        <button onClick={onClose} className="btn-icon">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isEditing ? (
          <TaskEditForm
            task={task}
            onSave={async (updates) => {
              await updateTask(projectId, taskId, updates)
              setIsEditing(false)
            }}
            onCancel={() => setIsEditing(false)}
          />
        ) : (
          <>
            <div>
              <div className="flex items-start justify-between">
                <h3 className="text-xl font-medium text-gray-900 dark:text-gray-100">
                  {task.title}
                </h3>
                <span className={`status-badge ${task.status.replace('_', '-')}`}>
                  {task.status.replace('_', ' ')}
                </span>
              </div>
              {/* Task Timer */}
              {task.startedAt && (
                <div className="mt-2">
                  <TaskTimer task={task} />
                </div>
              )}
              {task.description && (
                <p className="mt-2 text-gray-600 dark:text-gray-400">
                  {task.description}
                </p>
              )}
            </div>

            {/* Acceptance Criteria */}
            {task.acceptanceCriteria.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Acceptance Criteria
                </h4>
                <ul className="space-y-1">
                  {task.acceptanceCriteria.map((criterion, index) => (
                    <li
                      key={index}
                      className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400"
                    >
                      <span className="text-gray-400">•</span>
                      {criterion}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Stats */}
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

            {/* Live Logs Section (when task is active) */}
            {isTaskActive && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Live Output
                </h4>
                <div className="h-64 rounded-lg overflow-hidden">
                  <LogViewer
                    logContent={liveContent || 'Waiting for output...'}
                    isLive={true}
                  />
                </div>
              </div>
            )}

            {/* Execution Logs Section (historical logs) */}
            {task.logs.length > 0 && !isTaskActive && (
              <div>
                <button
                  onClick={() => setShowLogs(!showLogs)}
                  className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
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
                      <div className="h-48 rounded-lg overflow-hidden">
                        <LogViewer
                          logContent={logContent}
                          title="Latest Log"
                        />
                      </div>
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
            <div className="flex gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button onClick={() => setIsEditing(true)} className="btn-secondary flex-1">
                Edit
              </button>
              <button
                onClick={async () => {
                  if (confirm('Are you sure you want to delete this task?')) {
                    await deleteTask(projectId, taskId)
                    onClose()
                  }
                }}
                className="btn-danger"
              >
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function TaskEditForm({
  task,
  onSave,
  onCancel
}: {
  task: Task
  onSave: (updates: Partial<Task>) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description)
  const [criteria, setCriteria] = useState(task.acceptanceCriteria.join('\n'))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    onSave({
      title: title.trim(),
      description: description.trim(),
      acceptanceCriteria: criteria
        .split('\n')
        .map((c) => c.trim())
        .filter(Boolean)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Title *</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="input"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="textarea h-24"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">
          Acceptance Criteria (one per line)
        </label>
        <textarea
          value={criteria}
          onChange={(e) => setCriteria(e.target.value)}
          className="textarea h-24"
        />
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={!title.trim()} className="btn-primary flex-1">
          Save
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  )
}
