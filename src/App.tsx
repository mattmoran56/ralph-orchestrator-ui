import { useState } from 'react'
import { ProjectList } from './components/ProjectPanel/ProjectList'
import { KanbanBoard } from './components/Kanban/Board'
import { TaskDetail } from './components/TaskPanel/TaskDetail'
import { SettingsPanel } from './components/Settings/SettingsPanel'
import { useProjectStore } from './stores/projectStore'
import { useElectronSync } from './hooks/useElectronSync'

function App() {
  // Initialize Electron sync
  useElectronSync()

  const { selectedProjectId, selectedTaskId, isLoading } = useProjectStore()
  const [showTaskDetail, setShowTaskDetail] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

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
      <div className="h-8 bg-gray-100 dark:bg-gray-800 draggable flex items-center justify-between px-20 border-b border-gray-200 dark:border-gray-700">
        <div /> {/* Spacer for window controls on macOS */}
        <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
          Ralph Orchestrator
        </span>
        <button
          onClick={() => setShowSettings(true)}
          className="non-draggable p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded"
          title="Settings"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
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

      {/* Settings Panel */}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  )
}

export default App
