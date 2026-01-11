import { useState, useEffect } from 'react'
import type { GitHubAuthStatus } from '../../types'

interface SettingsPanelProps {
  onClose: () => void
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [githubStatus, setGitHubStatus] = useState<GitHubAuthStatus | null>(null)
  const [claudeAvailable, setClaudeAvailable] = useState<boolean | null>(null)
  const [isLoggingIn, setIsLoggingIn] = useState(false)

  const checkStatus = async () => {
    if (window.electronAPI) {
      const [ghStatus, claudeStatus] = await Promise.all([
        window.electronAPI.getGitHubAuthStatus(),
        window.electronAPI.isClaudeAvailable()
      ])
      setGitHubStatus(ghStatus)
      setClaudeAvailable(claudeStatus)
    }
  }

  useEffect(() => {
    checkStatus()
  }, [])

  const handleGitHubLogin = async () => {
    if (!window.electronAPI) return
    setIsLoggingIn(true)
    try {
      await window.electronAPI.loginToGitHub()
      // Re-check status after login attempt
      await checkStatus()
    } finally {
      setIsLoggingIn(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg mx-4">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Settings</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-6">
          {/* Claude CLI Status */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Claude CLI
            </h4>
            <div className="flex items-center gap-2">
              {claudeAvailable === null ? (
                <span className="text-sm text-gray-500">Checking...</span>
              ) : claudeAvailable ? (
                <>
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-sm text-green-600 dark:text-green-400">
                    Installed and available
                  </span>
                </>
              ) : (
                <>
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-sm text-red-600 dark:text-red-400">
                    Not found - please install Claude CLI
                  </span>
                </>
              )}
            </div>
          </div>

          {/* GitHub CLI Status */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              GitHub CLI
            </h4>
            {githubStatus === null ? (
              <span className="text-sm text-gray-500">Checking...</span>
            ) : !githubStatus.installed ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-sm text-red-600 dark:text-red-400">
                    Not installed
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  Install GitHub CLI to enable automatic PR creation.{' '}
                  <a
                    href="https://cli.github.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-ralph-600 hover:text-ralph-700"
                  >
                    Download here
                  </a>
                </p>
              </div>
            ) : !githubStatus.authenticated ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-yellow-500" />
                  <span className="text-sm text-yellow-600 dark:text-yellow-400">
                    Installed but not authenticated
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  Authenticate with GitHub to enable automatic PR creation when projects complete.
                </p>
                <button
                  onClick={handleGitHubLogin}
                  disabled={isLoggingIn}
                  className="btn-primary text-sm disabled:opacity-50"
                >
                  {isLoggingIn ? (
                    <>
                      <svg className="animate-spin w-4 h-4 mr-2" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Authenticating...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                        <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
                      </svg>
                      Connect GitHub Account
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-sm text-green-600 dark:text-green-400">
                  Authenticated and ready
                </span>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500">
              Ralph Orchestrator uses the GitHub CLI (gh) to create pull requests when projects complete.
              Make sure both Claude CLI and GitHub CLI are installed and configured.
            </p>
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button onClick={onClose} className="btn-secondary">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
