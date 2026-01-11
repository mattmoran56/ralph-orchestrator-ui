import { useMemo, useState, useRef, useEffect } from 'react'
import { useProjectStore } from '../../stores/projectStore'
import { useElectronProjects, useElectronTasks } from '../../hooks/useElectronSync'
import type { Task, TaskStatus, ProjectStatus } from '../../types'

// Status indicator colors matching the sidebar
const statusIndicator: Record<ProjectStatus, string> = {
  idle: 'bg-gray-400',
  paused: 'bg-gray-400',
  running: 'bg-green-500 animate-pulse',
  completed: 'bg-blue-500',
  failed: 'bg-red-500'
}

// Human-readable status labels
const statusLabel: Record<ProjectStatus, string> = {
  idle: 'Not Started',
  paused: 'Paused',
  running: 'In Progress',
  completed: 'Completed',
  failed: 'Failed'
}

const columns: { id: TaskStatus; title: string; color: string }[] = [
  { id: 'backlog', title: 'Backlog', color: 'bg-gray-400' },
  { id: 'in_progress', title: 'In Progress', color: 'bg-blue-500' },
  { id: 'verifying', title: 'Verifying', color: 'bg-yellow-500' },
  { id: 'done', title: 'Done', color: 'bg-green-500' },
  { id: 'blocked', title: 'Blocked', color: 'bg-red-500' }
]

interface KanbanBoardProps {
  projectId: string
  onTaskSelect: (taskId: string) => void
  onSettingsClick: () => void
}

export function KanbanBoard({ projectId, onTaskSelect, onSettingsClick }: KanbanBoardProps) {
  const { getProject, selectedTaskId } = useProjectStore()
  const { startProject, stopProject } = useElectronProjects()
  const { createTask, updateTask } = useElectronTasks()
  const project = getProject(projectId)
  const [addingToColumn, setAddingToColumn] = useState<TaskStatus | null>(null)

  const tasksByStatus = useMemo((): Partial<Record<TaskStatus, Task[]>> => {
    if (!project) return {}
    return project.tasks.reduce<Partial<Record<TaskStatus, Task[]>>>((acc, task) => {
      if (!acc[task.status]) acc[task.status] = []
      acc[task.status]!.push(task)
      return acc
    }, {})
  }, [project])

  if (!project) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-500">Project not found</p>
      </div>
    )
  }

  const handleStartProject = async () => {
    await startProject(projectId)
  }

  const handleStopProject = async () => {
    await stopProject(projectId)
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="draggable border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <div className="flex items-center gap-3">
          {/* Start/Stop button - green play when not running, red stop when running */}
          <div className="non-draggable">
            {project.status === 'idle' || project.status === 'paused' ? (
              <button
                onClick={handleStartProject}
                className="p-2 rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors"
                title="Start Project"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
              </button>
            ) : project.status === 'running' ? (
              <button
                onClick={handleStopProject}
                className="p-2 rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors"
                title="Stop Project"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                </svg>
              </button>
            ) : null}
          </div>

          {/* Title and status pill */}
          <div className="flex flex-col non-draggable">
            <button
              onClick={onSettingsClick}
              className="text-xl font-semibold text-gray-900 dark:text-gray-100 hover:underline cursor-pointer text-left"
            >
              {project.name}
            </button>
            {/* Status pill with color dot - under the title */}
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 w-fit mt-1">
              <span className={`w-2 h-2 rounded-full ${statusIndicator[project.status]}`} />
              {statusLabel[project.status]}
            </span>
          </div>

          {/* Spacer to push settings to the right */}
          <div className="flex-1" />

          {/* Settings button - small grey icon */}
          <button
            onClick={onSettingsClick}
            className="non-draggable p-2 rounded-md bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-300 dark:hover:bg-gray-500 transition-colors"
            title="Project Settings"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Kanban columns */}
      <div className="overflow-x-auto p-4">
        <div className="flex gap-4 min-w-max items-start">
          {columns.map((column) => (
            <KanbanColumn
              key={column.id}
              columnId={column.id}
              title={column.title}
              color={column.color}
              tasks={tasksByStatus[column.id] || []}
              onTaskClick={onTaskSelect}
              onDrop={async (taskId) => await updateTask(projectId, taskId, { status: column.id })}
              isAddingTask={addingToColumn === column.id}
              onAddTaskClick={() => setAddingToColumn(column.id)}
              onCreateTask={async (title: string) => {
                await createTask(projectId, {
                  title,
                  description: '',
                  acceptanceCriteria: [],
                  status: column.id
                })
                setAddingToColumn(null)
              }}
              onCancelAddTask={() => setAddingToColumn(null)}
              selectedTaskId={selectedTaskId}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function KanbanColumn({
  columnId,
  title,
  color,
  tasks,
  onTaskClick,
  onDrop,
  isAddingTask,
  onAddTaskClick,
  onCreateTask,
  onCancelAddTask,
  selectedTaskId
}: {
  columnId: TaskStatus
  title: string
  color: string
  tasks: Task[]
  onTaskClick: (taskId: string) => void
  onDrop: (taskId: string) => void
  isAddingTask: boolean
  onAddTaskClick: () => void
  onCreateTask: (title: string) => void
  onCancelAddTask: () => void
  selectedTaskId: string | null
}) {
  const [isDragOver, setIsDragOver] = useState(false)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = () => {
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const taskId = e.dataTransfer.getData('taskId')
    if (taskId) {
      onDrop(taskId)
    }
  }

  return (
    <div
      className={`kanban-column ${isDragOver ? 'ring-2 ring-ralph-500' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-3 h-3 rounded-full ${color}`} />
        <h3 className="font-medium text-gray-700 dark:text-gray-300">{title}</h3>
        <span className="ml-auto text-sm text-gray-500">{tasks.length}</span>
      </div>
      <div className="space-y-2 min-h-[100px] flex flex-col">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onClick={() => onTaskClick(task.id)}
            isSelected={task.id === selectedTaskId}
          />
        ))}

        {/* Inline new task input */}
        {isAddingTask ? (
          <InlineTaskInput
            onSubmit={onCreateTask}
            onCancel={onCancelAddTask}
          />
        ) : (
          <button
            onClick={onAddTaskClick}
            className="mt-auto flex items-center gap-2 w-full p-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add task
          </button>
        )}
      </div>
    </div>
  )
}

function TaskCard({ task, onClick, isSelected }: { task: Task; onClick: () => void; isSelected: boolean }) {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('taskId', task.id)
  }

  return (
    <div
      className={`task-card ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
      draggable
      onDragStart={handleDragStart}
    >
      <h4 className="font-medium text-gray-900 dark:text-gray-100 text-sm">
        {task.title}
      </h4>
      {task.description && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
          {task.description}
        </p>
      )}
      <div className="mt-2 flex items-center gap-2">
        {task.acceptanceCriteria.length > 0 && (
          <span className="text-xs text-gray-400">
            {task.acceptanceCriteria.length} criteria
          </span>
        )}
        {task.attempts > 0 && (
          <span className="text-xs text-yellow-600 dark:text-yellow-400">
            {task.attempts} attempt{task.attempts > 1 ? 's' : ''}
          </span>
        )}
        {task.logs.length > 0 && (
          <span className="text-xs text-blue-600 dark:text-blue-400">
            {task.logs.length} log{task.logs.length > 1 ? 's' : ''}
          </span>
        )}
      </div>
    </div>
  )
}

function InlineTaskInput({
  onSubmit,
  onCancel
}: {
  onSubmit: (title: string) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (title.trim()) {
      onSubmit(title.trim())
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel()
    }
  }

  const handleBlur = () => {
    if (title.trim()) {
      onSubmit(title.trim())
    } else {
      onCancel()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="task-card">
      <input
        ref={inputRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className="w-full bg-transparent border-none outline-none text-sm font-medium text-gray-900 dark:text-gray-100 placeholder-gray-400"
        placeholder="Task title..."
      />
    </form>
  )
}
