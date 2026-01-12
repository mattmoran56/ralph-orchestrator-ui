import { useState, useEffect, useRef, useCallback } from 'react'
import { useProjectStore } from '../../stores/projectStore'
import { useElectronTasks } from '../../hooks/useElectronSync'
import { MarkdownEditor } from '../Editor/MarkdownEditor'
import { TaskTimer } from './TaskTimer'
import type { Task } from '../../types'

interface TaskDetailProps {
  projectId: string
  taskId: string
  onClose: () => void
}

export function TaskDetail({ projectId, taskId, onClose }: TaskDetailProps) {
  const { getTask } = useProjectStore()
  const { updateTask, deleteTask } = useElectronTasks()
  const task = getTask(projectId, taskId)

  const [width, setWidth] = useState(480)
  const [isResizing, setIsResizing] = useState(false)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Local state for editable fields
  const [title, setTitle] = useState(task?.title || '')
  const [description, setDescription] = useState(task?.description || '')
  const [criteria, setCriteria] = useState(task?.acceptanceCriteria.join('\n') || '')

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
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400">Attempts</div>
            <div className="text-lg font-medium">{task.attempts}</div>
          </div>
        </div>

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
