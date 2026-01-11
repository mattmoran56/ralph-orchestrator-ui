import { useState, useMemo, useRef, useEffect } from 'react'
import { useProjectStore } from '../../stores/projectStore'
import { useElectronProjects, useElectronRepositories } from '../../hooks/useElectronSync'
import type { Project, Repository, GitHubRepo } from '../../types'

interface ProjectListProps {
  isSettingsSelected: boolean
  onSettingsClick: () => void
  onProjectCreated: () => void
}

export function ProjectList({ isSettingsSelected, onSettingsClick, onProjectCreated }: ProjectListProps) {
  const { repositories, projects, selectedProjectId, selectProject } = useProjectStore()
  const { deleteProject } = useElectronProjects()
  const { createRepository, deleteRepository, fetchGitHubRepos, gitHubRepos, isLoadingGitHub, gitHubError } = useElectronRepositories()
  const { createProject } = useElectronProjects()

  const [showAddRepoModal, setShowAddRepoModal] = useState(false)
  const [collapsedRepos, setCollapsedRepos] = useState<Set<string>>(new Set())
  const [addProjectToRepo, setAddProjectToRepo] = useState<string | null>(null)

  // Group projects by repository
  const reposWithProjects = useMemo(() => {
    return repositories.map((repo) => ({
      repository: repo,
      projects: projects.filter((p) => p.repositoryId === repo.id)
    }))
  }, [repositories, projects])

  const toggleRepoCollapse = (repoId: string) => {
    setCollapsedRepos((prev) => {
      const next = new Set(prev)
      if (next.has(repoId)) {
        next.delete(repoId)
      } else {
        next.add(repoId)
      }
      return next
    })
  }

  const handleAddRepository = () => {
    fetchGitHubRepos()
    setShowAddRepoModal(true)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Draggable area for window controls */}
      <div className="h-12 draggable flex-shrink-0" />

      {/* Add Repository button */}
      <div className="px-2 pb-6">
        <button
          onClick={handleAddRepository}
          className="w-full flex items-center gap-2 px-2 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" strokeWidth={1.5} />
            <path strokeLinecap="round" strokeWidth={2} d="M12 8v8m-4-4h8" />
          </svg>
          Add Repository
        </button>
      </div>

      {/* Repository list with nested projects */}
      <div className="flex-1 overflow-y-auto px-2">
        {reposWithProjects.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-gray-500 dark:text-gray-400">No repositories yet</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Add a repository to get started
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {reposWithProjects.map(({ repository, projects }) => (
              <RepositorySection
                key={repository.id}
                repository={repository}
                projects={projects}
                isCollapsed={collapsedRepos.has(repository.id)}
                onToggle={() => toggleRepoCollapse(repository.id)}
                onAddProject={() => setAddProjectToRepo(repository.id)}
                onSelectProject={selectProject}
                selectedProjectId={selectedProjectId}
                onDeleteProject={deleteProject}
                onDeleteRepository={deleteRepository}
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

      {/* Add Repository Modal */}
      {showAddRepoModal && (
        <AddRepositoryModal
          gitHubRepos={gitHubRepos}
          isLoading={isLoadingGitHub}
          error={gitHubError}
          existingRepoUrls={repositories.map((r) => r.url)}
          onClose={() => setShowAddRepoModal(false)}
          onAdd={async (ghRepo, baseBranch) => {
            await createRepository({
              name: ghRepo.name,
              nameWithOwner: ghRepo.nameWithOwner,
              url: ghRepo.url,
              owner: ghRepo.owner.login,
              baseBranch,
              isPrivate: ghRepo.isPrivate
            })
            setShowAddRepoModal(false)
          }}
        />
      )}

      {/* New Project Modal (for specific repo) */}
      {addProjectToRepo && (
        <NewProjectForm
          repositoryId={addProjectToRepo}
          repository={repositories.find((r) => r.id === addProjectToRepo)}
          onClose={() => setAddProjectToRepo(null)}
          onSubmit={async (input) => {
            await createProject(input)
            setAddProjectToRepo(null)
            onProjectCreated()
          }}
        />
      )}
    </div>
  )
}

function RepositorySection({
  repository,
  projects,
  isCollapsed,
  onToggle,
  onAddProject,
  onSelectProject,
  selectedProjectId,
  onDeleteProject,
  onDeleteRepository
}: {
  repository: Repository
  projects: Project[]
  isCollapsed: boolean
  onToggle: () => void
  onAddProject: () => void
  onSelectProject: (id: string) => void
  selectedProjectId: string | null
  onDeleteProject: (id: string) => Promise<void>
  onDeleteRepository: (id: string) => Promise<void>
}) {
  const [showMenu, setShowMenu] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showMenu])

  const handleDeleteRepository = async () => {
    await onDeleteRepository(repository.id)
    setShowDeleteConfirm(false)
  }

  return (
    <>
      <div className="group">
        {/* Repository header */}
        <div className="flex items-center gap-1 px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md">
          <button onClick={onToggle} className="flex-1 flex items-center gap-2 text-left min-w-0">
            <svg
              className={`w-3 h-3 flex-shrink-0 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                clipRule="evenodd"
              />
            </svg>
            <svg className="w-4 h-4 flex-shrink-0 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <span className="text-sm font-medium truncate">{repository.name}</span>
            <span className="text-xs text-gray-400 flex-shrink-0">({projects.length})</span>
          </button>

          {/* Add project button on hover */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onAddProject()
            }}
            className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-opacity"
            title="Add project to this repository"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeWidth={2} d="M12 6v12m-6-6h12" />
            </svg>
          </button>

          {/* More menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowMenu(!showMenu)
              }}
              className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-opacity"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
            </button>
            {showMenu && (
              <div className="absolute right-0 mt-1 w-40 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowMenu(false)
                    setShowDeleteConfirm(true)
                  }}
                  disabled={projects.length > 0}
                  className="w-full px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  title={projects.length > 0 ? 'Delete all projects first' : ''}
                >
                  Delete Repository
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Nested projects */}
        {!isCollapsed && (
          <div className="ml-5 space-y-0.5">
            {projects.length === 0 ? (
              <div className="text-xs text-gray-400 py-1 px-2">No projects</div>
            ) : (
              projects.map((project) => (
                <ProjectItem
                  key={project.id}
                  project={project}
                  isSelected={project.id === selectedProjectId}
                  onSelect={() => onSelectProject(project.id)}
                  onDelete={() => onDeleteProject(project.id)}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* Delete Repository Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Delete Repository
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Are you sure you want to remove "{repository.name}" from Ralph? This will not affect the repository on GitHub.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteRepository}
                className="btn-danger"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function ProjectItem({
  project,
  isSelected,
  onSelect,
  onDelete
}: {
  project: Project
  isSelected: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  const [showMenu, setShowMenu] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const statusIndicator = {
    idle: 'bg-gray-400',
    paused: 'bg-gray-400',
    running: 'bg-green-500 animate-pulse',
    completed: 'bg-blue-500',
    failed: 'bg-red-500'
  }

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showMenu])

  const handleDelete = async () => {
    await onDelete()
    setShowDeleteConfirm(false)
  }

  return (
    <>
      <div
        className={`group w-full flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors text-left ${
          isSelected
            ? 'bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800'
        }`}
      >
        <button
          onClick={onSelect}
          className="flex items-center gap-2 flex-1 min-w-0"
        >
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${statusIndicator[project.status]}`} />
          <span className="text-sm truncate">{project.name}</span>
        </button>

        {/* More menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowMenu(!showMenu)
            }}
            className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
            </svg>
          </button>
          {showMenu && (
            <div className="absolute right-0 mt-1 w-36 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setShowMenu(false)
                  setShowDeleteConfirm(true)
                }}
                className="w-full px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Delete Project
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Delete Project
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Are you sure you want to delete "{project.name}"? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="btn-danger"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function AddRepositoryModal({
  gitHubRepos,
  isLoading,
  error,
  existingRepoUrls,
  onClose,
  onAdd
}: {
  gitHubRepos: GitHubRepo[]
  isLoading: boolean
  error: string | null
  existingRepoUrls: string[]
  onClose: () => void
  onAdd: (repo: GitHubRepo, baseBranch: string) => void
}) {
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null)
  const [baseBranch, setBaseBranch] = useState('main')

  // Filter out already-added repos
  const availableRepos = gitHubRepos.filter((r) => !existingRepoUrls.includes(r.url))

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold">Add Repository</h3>
        </div>

        <div className="p-4 space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-ralph-600"></div>
              <span className="ml-2 text-sm text-gray-500">Loading repositories...</span>
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              <p className="text-xs text-gray-500 mt-2">Make sure you're authenticated with GitHub CLI</p>
            </div>
          ) : availableRepos.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-500">No new repositories available</p>
              <p className="text-xs text-gray-400 mt-1">All your repositories have been added</p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">Repository</label>
                <select
                  value={selectedRepo?.url || ''}
                  onChange={(e) => {
                    const repo = availableRepos.find((r) => r.url === e.target.value)
                    setSelectedRepo(repo || null)
                  }}
                  className="input"
                >
                  <option value="">Select a repository...</option>
                  {availableRepos.map((repo) => (
                    <option key={repo.url} value={repo.url}>
                      {repo.nameWithOwner} {repo.isPrivate ? '(private)' : ''}
                    </option>
                  ))}
                </select>
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
                <p className="text-xs text-gray-500 mt-1">
                  The default branch for new projects in this repository
                </p>
              </div>
            </>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={() => selectedRepo && onAdd(selectedRepo, baseBranch || 'main')}
            disabled={!selectedRepo}
            className="btn-primary disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  )
}

function NewProjectForm({
  repositoryId,
  repository,
  onClose,
  onSubmit
}: {
  repositoryId: string
  repository?: Repository
  onClose: () => void
  onSubmit: (input: { repositoryId: string; name: string; description: string; productBrief: string; solutionBrief: string; baseBranch: string }) => void
}) {
  const [name, setName] = useState('')
  const [baseBranch, setBaseBranch] = useState(repository?.baseBranch || 'main')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    onSubmit({
      repositoryId,
      name: name.trim(),
      description: '',
      productBrief: '',
      solutionBrief: '',
      baseBranch: baseBranch.trim() || 'main'
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold">New Project</h3>
          {repository && (
            <p className="text-sm text-gray-500 mt-1">in {repository.nameWithOwner}</p>
          )}
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
            <label className="block text-sm font-medium mb-1">Base Branch</label>
            <input
              type="text"
              value={baseBranch}
              onChange={(e) => setBaseBranch(e.target.value)}
              className="input"
              placeholder="main"
            />
            <p className="text-xs text-gray-500 mt-1">
              Branch to create changes from (defaults to repository setting)
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
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
