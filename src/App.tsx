import { useState } from 'react'
import { ProjectList } from './components/ProjectPanel/ProjectList'
import { KanbanBoard } from './components/Kanban/Board'
import { TaskDetail } from './components/TaskPanel/TaskDetail'
import { useProjectStore } from './stores/projectStore'
import { useElectronSync } from './hooks/useElectronSync'

function App() {
  // Initialize Electron sync
  useElectronSync()

  const { selectedProjectId, selectedTaskId, isLoading } = useProjectStore()
  const [showTaskDetail, setShowTaskDetail] = useState(false)

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
          <ProjectList />
        </aside>

        {/* Main content - Kanban Board */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {selectedProjectId ? (
            <KanbanBoard
              projectId={selectedProjectId}
              onTaskSelect={(taskId) => {
                useProjectStore.setState({ selectedTaskId: taskId })
                setShowTaskDetail(true)
              }}
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

        {/* Task Detail Slide-over */}
        {showTaskDetail && selectedTaskId && (
          <aside className="w-96 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex flex-col">
            <TaskDetail
              projectId={selectedProjectId!}
              taskId={selectedTaskId}
              onClose={() => setShowTaskDetail(false)}
            />
          </aside>
        )}
      </div>
    </div>
  )
}

export default App
