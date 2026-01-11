import { useState } from 'react'
import { useProjectStore } from '../../stores/projectStore'
import { useElectronProjects } from '../../hooks/useElectronSync'

interface ProjectDetailProps {
  projectId: string
  onClose: () => void
}

type Tab = 'overview' | 'productBrief' | 'solutionBrief' | 'settings'

export function ProjectDetail({ projectId, onClose }: ProjectDetailProps) {
  const { getProject, getRepository } = useProjectStore()
  const { updateProject, deleteProject } = useElectronProjects()
  const project = getProject(projectId)
  const repository = project ? getRepository(project.repositoryId) : undefined
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [editing, setEditing] = useState(false)

  // Local edit state
  const [name, setName] = useState(project?.name || '')
  const [description, setDescription] = useState(project?.description || '')
  const [productBrief, setProductBrief] = useState(project?.productBrief || '')
  const [solutionBrief, setSolutionBrief] = useState(project?.solutionBrief || '')
  const [baseBranch, setBaseBranch] = useState(project?.baseBranch || '')

  if (!project) {
    return (
      <div className="p-4">
        <p className="text-gray-500">Project not found</p>
      </div>
    )
  }

  const handleSave = async () => {
    await updateProject(projectId, {
      name,
      description,
      productBrief,
      solutionBrief,
      baseBranch
    })
    setEditing(false)
  }

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this project? This cannot be undone.')) {
      await deleteProject(projectId)
      onClose()
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'productBrief', label: 'Product Brief' },
    { id: 'solutionBrief', label: 'Solution Brief' },
    { id: 'settings', label: 'Settings' }
  ]

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{project.name}</h2>
          <button onClick={onClose} className="btn-icon">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                activeTab === tab.id
                  ? 'bg-ralph-100 text-ralph-700 dark:bg-ralph-900/30 dark:text-ralph-300'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'overview' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Name
              </label>
              {editing ? (
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input"
                />
              ) : (
                <p className="text-gray-900 dark:text-gray-100">{project.name}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description
              </label>
              {editing ? (
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="textarea h-20"
                />
              ) : (
                <p className="text-gray-600 dark:text-gray-400">
                  {project.description || 'No description'}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Repository
              </label>
              <p className="text-gray-600 dark:text-gray-400 font-mono text-sm">
                {repository?.nameWithOwner || 'Unknown repository'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Base Branch
                </label>
                <p className="text-gray-600 dark:text-gray-400">{project.baseBranch}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Working Branch
                </label>
                <p className="text-gray-600 dark:text-gray-400">{project.workingBranch}</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Status
              </label>
              <span className={`status-badge ${project.status}`}>{project.status}</span>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Tasks
              </label>
              <p className="text-gray-600 dark:text-gray-400">
                {project.tasks.filter((t) => t.status === 'done').length} / {project.tasks.length} completed
              </p>
            </div>

            {!editing && (
              <button onClick={() => setEditing(true)} className="btn-secondary">
                Edit Details
              </button>
            )}
          </div>
        )}

        {activeTab === 'productBrief' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              The product brief describes what you're building and why. Claude will use this to
              understand the project context.
            </p>
            <textarea
              value={editing ? productBrief : project.productBrief}
              onChange={(e) => setProductBrief(e.target.value)}
              readOnly={!editing}
              placeholder="Describe the product, its goals, target users, and key features..."
              className={`textarea h-96 font-mono text-sm ${!editing ? 'bg-gray-50 dark:bg-gray-900' : ''}`}
            />
          </div>
        )}

        {activeTab === 'solutionBrief' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              The solution brief describes the technical approach. Include architecture decisions,
              technology choices, and implementation guidelines.
            </p>
            <textarea
              value={editing ? solutionBrief : project.solutionBrief}
              onChange={(e) => setSolutionBrief(e.target.value)}
              readOnly={!editing}
              placeholder="Describe the technical solution, architecture, tech stack, and coding conventions..."
              className={`textarea h-96 font-mono text-sm ${!editing ? 'bg-gray-50 dark:bg-gray-900' : ''}`}
            />
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Repository
              </label>
              <p className="text-gray-600 dark:text-gray-400 font-mono text-sm bg-gray-50 dark:bg-gray-900 px-3 py-2 rounded-md">
                {repository?.nameWithOwner || 'Unknown repository'}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Base Branch
              </label>
              {editing ? (
                <input
                  type="text"
                  value={baseBranch}
                  onChange={(e) => setBaseBranch(e.target.value)}
                  className="input"
                />
              ) : (
                <p className="text-gray-600 dark:text-gray-400">{project.baseBranch}</p>
              )}
            </div>

            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <h4 className="text-sm font-medium text-red-600 dark:text-red-400 mb-2">
                Danger Zone
              </h4>
              <button onClick={handleDelete} className="btn-danger">
                Delete Project
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer actions */}
      {editing && (
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          <button
            onClick={() => {
              setEditing(false)
              // Reset to original values
              setName(project.name)
              setDescription(project.description)
              setProductBrief(project.productBrief)
              setSolutionBrief(project.solutionBrief)
              setBaseBranch(project.baseBranch)
            }}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button onClick={handleSave} className="btn-primary">
            Save Changes
          </button>
        </div>
      )}

      {!editing && (activeTab === 'productBrief' || activeTab === 'solutionBrief') && (
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button onClick={() => setEditing(true)} className="btn-primary">
            Edit Brief
          </button>
        </div>
      )}
    </div>
  )
}
