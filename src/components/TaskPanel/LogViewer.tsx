import { useState, useEffect, useRef } from 'react'

interface LogViewerProps {
  logContent: string
  title?: string
  onClose?: () => void
  autoScroll?: boolean
  isLive?: boolean
}

export function LogViewer({ logContent, title, onClose, autoScroll = true, isLive = false }: LogViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(true)

  // Auto-scroll when new content arrives
  useEffect(() => {
    if (autoScroll && isScrolledToBottom && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [logContent, autoScroll, isScrolledToBottom])

  // Track scroll position
  const handleScroll = () => {
    if (containerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50
      setIsScrolledToBottom(isAtBottom)
    }
  }

  // Parse and highlight log content
  const formatLog = (content: string) => {
    return content.split('\n').map((line, index) => {
      let className = 'log-line'

      // Color coding for different types of output
      if (line.startsWith('[STDERR]')) {
        className += ' text-red-400'
      } else if (line.startsWith('===')) {
        className += ' text-yellow-400 font-bold'
      } else if (line.includes('error') || line.includes('Error')) {
        className += ' text-red-300'
      } else if (line.includes('warning') || line.includes('Warning')) {
        className += ' text-yellow-300'
      } else if (line.includes('TASK_COMPLETE') || line.includes('VERIFICATION_PASSED')) {
        className += ' text-green-400 font-bold'
      } else if (line.includes('TASK_BLOCKED') || line.includes('VERIFICATION_FAILED')) {
        className += ' text-red-400 font-bold'
      }

      return (
        <div key={index} className={className}>
          {line || '\u00A0'}
        </div>
      )
    })
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 rounded-lg overflow-hidden">
      {/* Header */}
      {(title || onClose || isLive) && (
        <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-300">{title || 'Log Output'}</span>
            {isLive && (
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-600/20 text-green-400 text-xs font-medium">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                Live
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isScrolledToBottom && (
              <button
                onClick={() => {
                  if (containerRef.current) {
                    containerRef.current.scrollTop = containerRef.current.scrollHeight
                    setIsScrolledToBottom(true)
                  }
                }}
                className="text-xs text-gray-400 hover:text-gray-200"
              >
                Scroll to bottom
              </button>
            )}
            {onClose && (
              <button onClick={onClose} className="text-gray-400 hover:text-gray-200">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Log content */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto p-4 font-mono text-xs text-gray-100 leading-relaxed"
      >
        {logContent ? (
          formatLog(logContent)
        ) : (
          <div className="text-gray-500 italic">No log content</div>
        )}
      </div>
    </div>
  )
}

// Compact inline log display
export function LogPreview({ content, maxLines = 10 }: { content: string; maxLines?: number }) {
  const lines = content.split('\n')
  const truncated = lines.length > maxLines
  const displayLines = truncated ? lines.slice(-maxLines) : lines

  return (
    <div className="log-viewer text-xs max-h-48 overflow-auto">
      {truncated && (
        <div className="text-gray-500 mb-2">... {lines.length - maxLines} lines hidden ...</div>
      )}
      {displayLines.map((line, index) => (
        <div key={index} className="log-line whitespace-pre-wrap">
          {line || '\u00A0'}
        </div>
      ))}
    </div>
  )
}
