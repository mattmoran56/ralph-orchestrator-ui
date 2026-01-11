import { useState } from 'react'
import { useProjectStore } from '../../stores/projectStore'
import { useElectronProjects } from '../../hooks/useElectronSync'
import type { Project } from '../../types'

const statusColors: Record<string, string> = {
  idle: 'bg-gray-400',
  running: 'bg-green-500 animate-pulse',
  paused: 'bg-yellow-500',
  completed: 'bg-blue-500',
  failed: 'bg-red-500'
}

export function ProjectList() {
  const { projects, selectedProjectId, selectProject } = useProjectStore()
  const { createProject } = useElectronProjects()
  const [showNewForm, setShowNewForm] = useState(false)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Projects</h2>
          <button
            onClick={() => setShowNewForm(true)}
            className="btn-icon text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            title="New Project"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-y-auto p-2">
        {projects.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-gray-500 dark:text-gray-400">No projects yet</p>
            <button
              onClick={() => setShowNewForm(true)}
              className="mt-2 text-sm text-ralph-600 hover:text-ralph-700"
            >
              Create your first project
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            {projects.map((project) => (
              <ProjectItem
                key={project.id}
                project={project}
                isSelected={project.id === selectedProjectId}
                onSelect={() => selectProject(project.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* New Project Modal - Simple inline form for now */}
      {showNewForm && (
        <NewProjectForm
          onClose={() => setShowNewForm(false)}
          onSubmit={async (input) => {
            await createProject(input)
            setShowNewForm(false)
          }}
        />
      )}
    </div>
  )
}

function ProjectItem({
  project,
  isSelected,
  onSelect
}: {
  project: Project
  isSelected: boolean
  onSelect: () => void
}) {
  const taskCounts = {
    total: project.tasks.length,
    done: project.tasks.filter((t) => t.status === 'done').length,
    inProgress: project.tasks.filter((t) => t.status === 'in_progress' || t.status === 'verifying').length
  }

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-3 rounded-lg transition-colors ${
        isSelected
          ? 'bg-ralph-100 dark:bg-ralph-900/30 border border-ralph-300 dark:border-ralph-700'
          : 'hover:bg-gray-100 dark:hover:bg-gray-700/50'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Status indicator */}
        <div className={`w-2 h-2 rounded-full mt-2 ${statusColors[project.status]}`} />

        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate">
            {project.name}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {project.description || 'No description'}
          </p>
          <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            {taskCounts.done}/{taskCounts.total} tasks
            {taskCounts.inProgress > 0 && (
              <span className="ml-2 text-blue-500">
                {taskCounts.inProgress} in progress
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}

function NewProjectForm({
  onClose,
  onSubmit
}: {
  onClose: () => void
  onSubmit: (input: { name: string; description: string; productBrief: string; solutionBrief: string; repoUrl: string; baseBranch: string }) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [repoUrl, setRepoUrl] = useState('')
  const [baseBranch, setBaseBranch] = useState('main')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !repoUrl.trim()) return

    onSubmit({
      name: name.trim(),
      description: description.trim(),
      productBrief: '',
      solutionBrief: '',
      repoUrl: repoUrl.trim(),
      baseBranch: baseBranch.trim() || 'main'
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold">New Project</h3>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              placeholder="My Project"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input"
              placeholder="Brief description"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Repository URL *</label>
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              className="input"
              placeholder="https://github.com/user/repo.git"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Base Branch</label>
            <input
              type="text"
              value={baseBranch}
              onChange={(e) => setBaseBranch(e.target.value)}
              className="input"
              placeholder="main"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || !repoUrl.trim()}
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
