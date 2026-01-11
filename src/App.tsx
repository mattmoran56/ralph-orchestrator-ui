import { useState, useEffect, useRef } from 'react'
import { ProjectList } from './components/ProjectPanel/ProjectList'
import { KanbanBoard } from './components/Kanban/Board'
import { TaskDetail } from './components/TaskPanel/TaskDetail'
import { SettingsPanel } from './components/Settings/SettingsPanel'
import { ProjectSidebar } from './components/ProjectPanel/ProjectSidebar'
import { useProjectStore } from './stores/projectStore'
import { useElectronSync } from './hooks/useElectronSync'

// Hook to get previous value
function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>()
  useEffect(() => {
    ref.current = value
  }, [value])
  return ref.current
}

type SidebarView = 'none' | 'project' | 'task'

function App() {
  // Initialize Electron sync
  useElectronSync()

  const { selectedProjectId, selectedTaskId, isLoading } = useProjectStore()
  const [showSettings, setShowSettings] = useState(false)
  const [sidebarView, setSidebarView] = useState<SidebarView>('none')

  // Show project sidebar when a new project is selected, and close settings
  const prevProjectId = usePrevious(selectedProjectId)
  useEffect(() => {
    if (selectedProjectId && selectedProjectId !== prevProjectId) {
      setSidebarView('project')
      setShowSettings(false)
    }
  }, [selectedProjectId, prevProjectId])

  // Handle settings click - deselect project when opening settings
  const handleSettingsClick = () => {
    useProjectStore.getState().selectProject(null)
    setShowSettings(true)
    setSidebarView('none')
  }

  // Handle task selection - opens task sidebar (replaces project sidebar)
  const handleTaskSelect = (taskId: string) => {
    useProjectStore.setState({ selectedTaskId: taskId })
    setSidebarView('task')
  }

  // Handle project settings click - opens project sidebar (replaces task sidebar)
  const handleProjectSettingsClick = () => {
    setSidebarView('project')
  }

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ralph-600 mx-auto"></div>
          <p className="mt-2 text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Title bar drag region for macOS */}
      <div className="h-8 bg-gray-100 dark:bg-gray-800 draggable flex items-center justify-center border-b border-gray-200 dark:border-gray-700">
        <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
          Ralph Orchestrator
        </span>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Project List */}
        <aside className="w-72 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
          <ProjectList
            isSettingsSelected={showSettings}
            onSettingsClick={handleSettingsClick}
          />
        </aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {showSettings ? (
            <SettingsPanel />
          ) : selectedProjectId ? (
            <KanbanBoard
              projectId={selectedProjectId}
              onTaskSelect={handleTaskSelect}
              onSettingsClick={handleProjectSettingsClick}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <h2 className="text-xl font-medium text-gray-500 dark:text-gray-400">
                  No project selected
                </h2>
                <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">
                  Select a project from the sidebar or create a new one
                </p>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Right Sidebar - Only one at a time */}
      {sidebarView === 'project' && selectedProjectId && (
        <ProjectSidebar
          projectId={selectedProjectId}
          onClose={() => setSidebarView('none')}
        />
      )}

      {sidebarView === 'task' && selectedProjectId && selectedTaskId && (
        <TaskDetail
          projectId={selectedProjectId}
          taskId={selectedTaskId}
          onClose={() => setSidebarView('none')}
        />
      )}
    </div>
  )
}

export default App
