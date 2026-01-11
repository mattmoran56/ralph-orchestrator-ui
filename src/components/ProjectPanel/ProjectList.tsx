import { useState, useMemo } from 'react'
import { useProjectStore } from '../../stores/projectStore'
import { useElectronProjects } from '../../hooks/useElectronSync'
import type { Project, ProjectStatus } from '../../types'

interface ProjectListProps {
  isSettingsSelected: boolean
  onSettingsClick: () => void
  onProjectCreated: () => void
}

interface ProjectGroup {
  title: string
  status: ProjectStatus[]
  projects: Project[]
}

export function ProjectList({ isSettingsSelected, onSettingsClick, onProjectCreated }: ProjectListProps) {
  const { projects, selectedProjectId, selectProject } = useProjectStore()
  const { createProject } = useElectronProjects()
  const [showNewForm, setShowNewForm] = useState(false)
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())

  // Group projects by status
  const projectGroups = useMemo((): ProjectGroup[] => {
    const groups: ProjectGroup[] = [
      { title: 'In Progress', status: ['running'], projects: [] },
      { title: 'Not Started', status: ['idle', 'paused'], projects: [] },
      { title: 'Completed', status: ['completed'], projects: [] },
      { title: 'Failed', status: ['failed'], projects: [] },
    ]

    projects.forEach((project) => {
      const group = groups.find((g) => g.status.includes(project.status))
      if (group) {
        group.projects.push(project)
      }
    })

    // Only return groups that have projects
    return groups.filter((g) => g.projects.length > 0)
  }, [projects])

  const toggleSection = (title: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      if (next.has(title)) {
        next.delete(title)
      } else {
        next.add(title)
      }
      return next
    })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Draggable area for window controls */}
      <div className="h-12 draggable flex-shrink-0" />

      {/* New Project button */}
      <div className="px-2 pb-6">
        <button
          onClick={() => setShowNewForm(true)}
          className="w-full flex items-center gap-2 px-2 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" strokeWidth={1.5} />
            <path strokeLinecap="round" strokeWidth={2} d="M12 8v8m-4-4h8" />
          </svg>
          New Project
        </button>
      </div>

      {/* Project list grouped by status */}
      <div className="flex-1 overflow-y-auto px-2">
        {projectGroups.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-gray-500 dark:text-gray-400">No projects yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {projectGroups.map((group) => (
              <ProjectSection
                key={group.title}
                title={group.title}
                projects={group.projects}
                selectedProjectId={selectedProjectId}
                onSelect={selectProject}
                isCollapsed={collapsedSections.has(group.title)}
                onToggle={() => toggleSection(group.title)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Settings button at bottom */}
      <div className="p-2">
        <button
          onClick={onSettingsClick}
          className={`w-full flex items-center gap-2 px-2 py-2 text-sm rounded-lg transition-colors ${
            isSettingsSelected
              ? 'bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Settings
        </button>
      </div>

      {/* New Project Modal */}
      {showNewForm && (
        <NewProjectForm
          onClose={() => setShowNewForm(false)}
          onSubmit={async (input) => {
            await createProject(input)
            setShowNewForm(false)
            onProjectCreated()
          }}
        />
      )}
    </div>
  )
}

function ProjectSection({
  title,
  projects,
  selectedProjectId,
  onSelect,
  isCollapsed,
  onToggle
}: {
  title: string
  projects: Project[]
  selectedProjectId: string | null
  onSelect: (id: string) => void
  isCollapsed: boolean
  onToggle: () => void
}) {
  return (
    <div>
      {/* Section header */}
      <button
        onClick={onToggle}
        className="flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 hover:text-gray-700 dark:hover:text-gray-300"
      >
        <svg
          className={`w-3 h-3 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
            clipRule="evenodd"
          />
        </svg>
        {title}
        <span className="text-gray-400 dark:text-gray-500 ml-1">({projects.length})</span>
      </button>

      {/* Projects */}
      {!isCollapsed && (
        <div className="space-y-0.5">
          {projects.map((project) => (
            <ProjectItem
              key={project.id}
              project={project}
              isSelected={project.id === selectedProjectId}
              onSelect={() => onSelect(project.id)}
            />
          ))}
        </div>
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
  const statusIndicator = {
    idle: 'bg-gray-400',
    paused: 'bg-gray-400',
    running: 'bg-green-500 animate-pulse',
    completed: 'bg-blue-500',
    failed: 'bg-red-500'
  }

  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors text-left ${
        isSelected
          ? 'bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800'
      }`}
    >
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${statusIndicator[project.status]}`} />
      <span className="text-sm truncate">{project.name}</span>
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
  const [repoUrl, setRepoUrl] = useState('')
  const [baseBranch, setBaseBranch] = useState('main')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !repoUrl.trim()) return

    onSubmit({
      name: name.trim(),
      description: '',
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
