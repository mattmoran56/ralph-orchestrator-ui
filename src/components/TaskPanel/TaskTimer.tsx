import type { Task } from '../../types'
import { useTaskTimer, formatDuration } from '../../hooks/useTaskTimer'

interface TaskTimerProps {
  task: Task
}

export function TaskTimer({ task }: TaskTimerProps) {
  const { inProgressDuration, verifyingDuration, totalDuration, isRunning } = useTaskTimer(task)

  // Don't show if task hasn't started
  if (!task.startedAt) {
    return null
  }

  const status = task.status

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {/* In Progress Duration */}
      {inProgressDuration !== null && (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
          {status === 'in_progress' && isRunning && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
          )}
          <span>In Progress:</span>
          <span className="font-mono font-medium">{formatDuration(inProgressDuration)}</span>
        </div>
      )}

      {/* Verifying Duration */}
      {verifyingDuration !== null && (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300">
          {status === 'verifying' && isRunning && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
            </span>
          )}
          <span>Verifying:</span>
          <span className="font-mono font-medium">{formatDuration(verifyingDuration)}</span>
        </div>
      )}

      {/* Total Duration (only for completed tasks) */}
      {totalDuration !== null && (status === 'done' || status === 'blocked') && (
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full ${
          status === 'done'
            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
            : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
        }`}>
          <span>Total:</span>
          <span className="font-mono font-medium">{formatDuration(totalDuration)}</span>
        </div>
      )}
    </div>
  )
}
