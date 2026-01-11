import { useState, useEffect, useRef, useCallback } from 'react'

interface LogViewerProps {
  logContent: string
  title?: string
  onClose?: () => void
  autoScroll?: boolean
  isLive?: boolean
  resizable?: boolean
  defaultHeight?: number
  minHeight?: number
  maxHeight?: number
  onHeightChange?: (height: number) => void
}

export function LogViewer({
  logContent,
  title,
  onClose,
  autoScroll = true,
  isLive = false,
  resizable = false,
  defaultHeight = 384,
  minHeight = 150,
  maxHeight = 800,
  onHeightChange
}: LogViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(true)
  const [height, setHeight] = useState(defaultHeight)
  const [isResizing, setIsResizing] = useState(false)

  // Handle resize
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }, [])

  useEffect(() => {
    if (!resizable) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !wrapperRef.current) return
      const rect = wrapperRef.current.getBoundingClientRect()
      const newHeight = e.clientY - rect.top
      const clampedHeight = Math.min(Math.max(minHeight, newHeight), maxHeight)
      setHeight(clampedHeight)
      onHeightChange?.(clampedHeight)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'ns-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizing, resizable, minHeight, maxHeight, onHeightChange])

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

  const wrapperStyle = resizable ? { height: `${height}px` } : undefined

  return (
    <div
      ref={wrapperRef}
      className="flex flex-col bg-gray-900 rounded-lg overflow-hidden relative"
      style={resizable ? { ...wrapperStyle, minHeight: `${minHeight}px` } : { height: '100%' }}
    >
      {/* Header */}
      {(title || onClose || isLive || resizable) && (
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
            {resizable && (
              <span className="text-xs text-gray-500">Drag bottom edge to resize</span>
            )}
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

      {/* Resize handle */}
      {resizable && (
        <div
          onMouseDown={handleMouseDown}
          className={`absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize flex items-center justify-center transition-colors ${
            isResizing ? 'bg-ralph-500' : 'bg-gray-700 hover:bg-ralph-500/50'
          }`}
        >
          <div className="w-8 h-1 bg-gray-500 rounded-full" />
        </div>
      )}
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
