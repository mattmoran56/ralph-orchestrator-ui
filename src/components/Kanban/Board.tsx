import { useMemo, useState } from 'react'
import { useProjectStore } from '../../stores/projectStore'
import { useElectronProjects, useElectronTasks } from '../../hooks/useElectronSync'
import type { Task, TaskStatus } from '../../types'

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
}

export function KanbanBoard({ projectId, onTaskSelect }: KanbanBoardProps) {
  const { getProject } = useProjectStore()
  const { startProject, stopProject } = useElectronProjects()
  const { createTask, updateTask } = useElectronTasks()
  const project = getProject(projectId)
  const [showNewTask, setShowNewTask] = useState(false)

  const tasksByStatus = useMemo(() => {
    if (!project) return {}
    return project.tasks.reduce((acc, task) => {
      if (!acc[task.status]) acc[task.status] = []
      acc[task.status].push(task)
      return acc
    }, {} as Record<TaskStatus, Task[]>)
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
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {project.name}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {project.description}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`status-badge ${project.status.replace('_', '-')}`}>
              {project.status}
            </span>
            {project.status === 'idle' || project.status === 'paused' ? (
              <button onClick={handleStartProject} className="btn-primary">
                <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
                Start
              </button>
            ) : project.status === 'running' ? (
              <button onClick={handleStopProject} className="btn-secondary">
                <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                </svg>
                Stop
              </button>
            ) : null}
            <button
              onClick={() => setShowNewTask(true)}
              className="btn-secondary"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Task
            </button>
          </div>
        </div>
      </div>

      {/* Kanban columns */}
      <div className="flex-1 overflow-x-auto p-4">
        <div className="flex gap-4 h-full min-w-max">
          {columns.map((column) => (
            <KanbanColumn
              key={column.id}
              title={column.title}
              color={column.color}
              tasks={tasksByStatus[column.id] || []}
              onTaskClick={onTaskSelect}
              onDrop={async (taskId) => await updateTask(projectId, taskId, { status: column.id })}
            />
          ))}
        </div>
      </div>

      {/* New Task Modal */}
      {showNewTask && (
        <NewTaskForm
          onClose={() => setShowNewTask(false)}
          onSubmit={async (input) => {
            await createTask(projectId, input)
            setShowNewTask(false)
          }}
        />
      )}
    </div>
  )
}

function KanbanColumn({
  title,
  color,
  tasks,
  onTaskClick,
  onDrop
}: {
  title: string
  color: string
  tasks: Task[]
  onTaskClick: (taskId: string) => void
  onDrop: (taskId: string) => void
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
      <div className="space-y-2 min-h-[100px]">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} onClick={() => onTaskClick(task.id)} />
        ))}
      </div>
    </div>
  )
}

function TaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('taskId', task.id)
  }

  return (
    <div
      className="task-card"
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

function NewTaskForm({
  onClose,
  onSubmit
}: {
  onClose: () => void
  onSubmit: (input: { title: string; description: string; acceptanceCriteria: string[] }) => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [criteria, setCriteria] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    onSubmit({
      title: title.trim(),
      description: description.trim(),
      acceptanceCriteria: criteria
        .split('\n')
        .map((c) => c.trim())
        .filter(Boolean)
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold">New Task</h3>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input"
              placeholder="Task title"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="textarea h-24"
              placeholder="What needs to be done?"
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
              placeholder="Tests pass&#10;Code is documented&#10;No linting errors"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className="btn-primary disabled:opacity-50"
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
