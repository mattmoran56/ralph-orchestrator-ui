import { useState, useRef, useEffect, useCallback } from 'react'
import MDEditor from '@uiw/react-md-editor'
import { useProjectStore } from '../../stores/projectStore'
import { useElectronProjects } from '../../hooks/useElectronSync'

interface ProjectSidebarProps {
  projectId: string
  onClose: () => void
}

export function ProjectSidebar({ projectId, onClose }: ProjectSidebarProps) {
  const { getProject } = useProjectStore()
  const { updateProject } = useElectronProjects()
  const project = getProject(projectId)

  const [width, setWidth] = useState(480)
  const [isResizing, setIsResizing] = useState(false)
  const [name, setName] = useState(project?.name || '')
  const [repoUrl, setRepoUrl] = useState(project?.repoUrl || '')
  const [baseBranch, setBaseBranch] = useState(project?.baseBranch || '')
  const [description, setDescription] = useState(project?.description || '')
  const sidebarRef = useRef<HTMLDivElement>(null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync local state when project changes
  useEffect(() => {
    if (project) {
      setName(project.name)
      setRepoUrl(project.repoUrl)
      setBaseBranch(project.baseBranch)
      setDescription(project.description)
    }
  }, [project])

  // Auto-save with debounce
  const saveChanges = useCallback(
    (updates: { name?: string; repoUrl?: string; baseBranch?: string; description?: string }) => {
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

  // Cleanup save timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  if (!project) return null

  return (
    <div
      ref={sidebarRef}
      className="fixed top-8 right-0 bottom-0 bg-white dark:bg-gray-800 z-40 flex flex-col border-l border-gray-200 dark:border-gray-700"
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
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Project Settings
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 rounded"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

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
              Repository URL
            </label>
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => {
                setRepoUrl(e.target.value)
                saveChanges({ repoUrl: e.target.value })
              }}
              className="input text-sm font-mono"
              placeholder="https://github.com/user/repo.git"
            />
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

          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span className={`status-badge ${project.status.replace('_', '-')}`}>
              {project.status}
            </span>
            <span>Working branch: {project.workingBranch || 'Not set'}</span>
          </div>
        </div>

        {/* Description with markdown editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
              Description
            </label>
          </div>
          <div className="flex-1 px-4 pb-4 overflow-auto" data-color-mode="light">
            <MDEditor
              value={description}
              onChange={(value) => {
                setDescription(value || '')
                saveChanges({ description: value || '' })
              }}
              preview="live"
              hideToolbar
              visibleDragbar={false}
              height="100%"
              style={{
                backgroundColor: 'transparent',
                minHeight: '100%'
              }}
              textareaProps={{
                placeholder: 'Add a description for this project...\n\nSupports **markdown** formatting.'
              }}
            />
          </div>
        </div>
    </div>
  )
}
