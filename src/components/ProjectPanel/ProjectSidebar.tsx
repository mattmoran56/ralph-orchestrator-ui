import { useState, useRef, useEffect, useCallback } from 'react'
import { MarkdownEditor } from '../Editor/MarkdownEditor'
import { LoopLogsViewer } from './LoopLogsViewer'
import { useProjectStore } from '../../stores/projectStore'
import { useElectronProjects } from '../../hooks/useElectronSync'

interface ProjectSidebarProps {
  projectId: string
  onClose: () => void
}

export function ProjectSidebar({ projectId, onClose }: ProjectSidebarProps) {
  const { getProject, getRepository } = useProjectStore()
  const { updateProject, deleteProject } = useElectronProjects()
  const project = getProject(projectId)
  const repository = project ? getRepository(project.repositoryId) : undefined

  const [activeTab, setActiveTab] = useState<'settings' | 'logs'>('settings')
  const [width, setWidth] = useState(480)
  const [isResizing, setIsResizing] = useState(false)
  const [name, setName] = useState(project?.name || '')
  const [baseBranch, setBaseBranch] = useState(project?.baseBranch || '')
  const [description, setDescription] = useState(project?.description || '')
  const [maxIterations, setMaxIterations] = useState(project?.maxIterations ?? 50)
  const [showMenu, setShowMenu] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync local state when project changes
  useEffect(() => {
    if (project) {
      setName(project.name)
      setBaseBranch(project.baseBranch)
      setDescription(project.description)
      setMaxIterations(project.maxIterations ?? 50)
    }
  }, [project])

  // Auto-save with debounce
  const saveChanges = useCallback(
    (updates: { name?: string; baseBranch?: string; description?: string; maxIterations?: number }) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
      saveTimeoutRef.current = setTimeout(() => {
        updateProject(projectId, updates)
      }, 500)
    },
    [projectId, updateProject]
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

  // Cleanup save timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  const handleDelete = async () => {
    await deleteProject(projectId)
    setShowDeleteConfirm(false)
    onClose()
  }

  if (!project) return null

  return (
    <>
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
        <div className="border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between p-4 pb-0">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Project
            </h2>
            <div className="flex items-center gap-1">
              {/* More menu */}
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="p-1 text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                  </svg>
                </button>
                {showMenu && (
                  <div className="absolute right-0 mt-1 w-36 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
                    <button
                      onClick={() => {
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
              {/* Close button */}
              <button
                onClick={onClose}
                className="p-1 text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          {/* Tab buttons */}
          <div className="flex px-4 mt-3">
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'settings'
                  ? 'text-ralph-600 dark:text-ralph-400 border-ralph-600 dark:border-ralph-400'
                  : 'text-gray-500 dark:text-gray-400 border-transparent hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Settings
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'logs'
                  ? 'text-ralph-600 dark:text-ralph-400 border-ralph-600 dark:border-ralph-400'
                  : 'text-gray-500 dark:text-gray-400 border-transparent hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Logs
            </button>
          </div>
        </div>

        {/* Tab content */}
        {activeTab === 'settings' ? (
          <>
            {/* Settings fields */}
            <div className="p-4 space-y-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value)
                    saveChanges({ name: e.target.value })
                  }}
                  className="input text-sm"
                  placeholder="Project name"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Repository
                </label>
                <p className="text-sm text-gray-700 dark:text-gray-300 font-mono bg-gray-50 dark:bg-gray-900 px-3 py-2 rounded-md">
                  {repository?.nameWithOwner || 'Unknown repository'}
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Base Branch
                </label>
                <input
                  type="text"
                  value={baseBranch}
                  onChange={(e) => {
                    setBaseBranch(e.target.value)
                    saveChanges({ baseBranch: e.target.value })
                  }}
                  className="input text-sm font-mono"
                  placeholder="main"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Max Iterations
                </label>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={maxIterations}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10)
                    if (!isNaN(value) && value >= 1 && value <= 1000) {
                      setMaxIterations(value)
                      saveChanges({ maxIterations: value })
                    } else if (e.target.value === '') {
                      setMaxIterations(50)
                      saveChanges({ maxIterations: 50 })
                    }
                  }}
                  className="input text-sm"
                />
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  Maximum loop iterations before pausing (default: 50)
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <span className={`status-badge ${project.status.replace('_', '-')}`}>
                  {project.status}
                </span>
                {project.status === 'running' && (
                  <span className="text-ralph-600 dark:text-ralph-400 font-medium">
                    Iteration {project.currentIteration} of {project.maxIterations}
                  </span>
                )}
                <span>Working branch: {project.workingBranch || 'Not set'}</span>
              </div>
            </div>

            {/* Description with markdown editor */}
            <div className="flex-1 flex flex-col overflow-hidden px-4">
              <div className="pt-4 pb-2">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
                  Description
                </label>
              </div>
              <div className="flex-1 pb-4 overflow-auto">
                <MarkdownEditor
                  value={description}
                  onChange={(value) => {
                    setDescription(value)
                    saveChanges({ description: value })
                  }}
                  placeholder="Add a description for this project... Type # for headings, - for lists"
                />
              </div>
            </div>
          </>
        ) : (
          /* Logs tab */
          <div className="flex-1 flex flex-col overflow-hidden">
            <LoopLogsViewer
              logs={project.loopLogs || []}
              currentIteration={project.currentIteration || 0}
              maxIterations={project.maxIterations || 50}
            />
            {/* Clear Logs button */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={async () => {
                  try {
                    await window.electronAPI.clearLoopLogs(projectId)
                  } catch (error) {
                    console.error('Failed to clear loop logs:', error)
                  }
                }}
                className="w-full px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
              >
                Clear Logs
              </button>
            </div>
          </div>
        )}
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
