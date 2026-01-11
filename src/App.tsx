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
  const [sidebarWidth, setSidebarWidth] = useState(256)
  const [isResizing, setIsResizing] = useState(false)

  // Close settings when a project is selected
  const prevProjectId = usePrevious(selectedProjectId)
  useEffect(() => {
    if (selectedProjectId && selectedProjectId !== prevProjectId) {
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

  // Handle new project created - show project settings sidebar
  const handleProjectCreated = () => {
    setSidebarView('project')
  }

  // Handle sidebar resize
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return
      const newWidth = e.clientX
      setSidebarWidth(Math.min(Math.max(200, newWidth), 500))
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
    <div className="h-screen flex bg-gray-50 dark:bg-gray-900">
      {/* Left Sidebar - Full height, resizable */}
      <aside
        className="bg-gray-100 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col relative flex-shrink-0"
        style={{ width: sidebarWidth }}
      >
        <ProjectList
          isSettingsSelected={showSettings}
          onSettingsClick={handleSettingsClick}
          onProjectCreated={handleProjectCreated}
        />
        {/* Resize handle */}
        <div
          className={`absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-ralph-500 transition-colors ${
            isResizing ? 'bg-ralph-500' : 'bg-transparent'
          }`}
          onMouseDown={(e) => {
            e.preventDefault()
            setIsResizing(true)
          }}
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
          <div className="flex-1 flex flex-col bg-white dark:bg-gray-800">
            {/* Draggable header bar for empty state */}
            <div className="h-12 draggable flex-shrink-0" />
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
          </div>
        )}
      </main>

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
