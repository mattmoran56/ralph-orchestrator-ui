import { spawn, execSync } from 'child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join, basename } from 'path'
import { getStateManager } from './StateManager'

export interface RepoConfig {
  repoUrl: string
  baseBranch: string
  workingBranch: string
  workspacePath: string
}

export interface GitResult {
  success: boolean
  output: string
  error?: string
}

class RepoManager {
  private workspacesPath: string

  constructor() {
    const stateManager = getStateManager()
    this.workspacesPath = stateManager.getDataPaths().workspaces

    // Ensure workspaces directory exists
    if (!existsSync(this.workspacesPath)) {
      mkdirSync(this.workspacesPath, { recursive: true })
    }
  }

  /**
   * Get the workspace path for a project
   */
  getProjectWorkspace(projectId: string): string {
    return join(this.workspacesPath, projectId)
  }

  /**
   * Get the repo path within a project workspace
   */
  getRepoPath(projectId: string, repoUrl: string): string {
    const repoName = this.extractRepoName(repoUrl)
    return join(this.getProjectWorkspace(projectId), repoName)
  }

  /**
   * Extract repo name from URL
   */
  private extractRepoName(repoUrl: string): string {
    const name = basename(repoUrl, '.git')
    return name || 'repo'
  }

  /**
   * Execute a git command and return the result
   */
  private execGit(command: string, cwd: string): GitResult {
    try {
      const output = execSync(command, {
        cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      })
      return { success: true, output: output.trim() }
    } catch (error) {
      const err = error as { stderr?: string; message?: string }
      return {
        success: false,
        output: '',
        error: err.stderr || err.message || 'Unknown git error'
      }
    }
  }

  /**
   * Clone a repository for a project (clones default branch)
   */
  async cloneRepo(projectId: string, repoUrl: string): Promise<GitResult> {
    const workspacePath = this.getProjectWorkspace(projectId)
    const repoPath = this.getRepoPath(projectId, repoUrl)
    const gitPath = join(repoPath, '.git')

    // Create workspace directory
    if (!existsSync(workspacePath)) {
      mkdirSync(workspacePath, { recursive: true })
    }

    // Check if repo already exists AND is a valid git repo
    if (existsSync(repoPath) && existsSync(gitPath)) {
      // Fetch latest changes instead
      const fetchResult = this.execGit('git fetch origin --prune', repoPath)
      if (!fetchResult.success) {
        return fetchResult
      }
      return { success: true, output: `Repository already exists at ${repoPath}. Fetched latest changes.` }
    }

    // If directory exists but isn't a valid git repo, clean it up
    // Use shell rm -rf because Node's rmSync can't handle Electron's .asar files
    if (existsSync(repoPath) && !existsSync(gitPath)) {
      try {
        execSync(`rm -rf "${repoPath}"`, { stdio: 'pipe' })
      } catch {
        // If rm fails, try Node's rmSync as fallback
        rmSync(repoPath, { recursive: true, force: true })
      }
    }

    // Clone the repository (default branch)
    return new Promise((resolve) => {
      const proc = spawn('git', ['clone', repoUrl], {
        cwd: workspacePath,
        stdio: ['pipe', 'pipe', 'pipe']
      })

      let output = ''
      let errorOutput = ''

      proc.stdout.on('data', (data) => {
        output += data.toString()
      })

      proc.stderr.on('data', (data) => {
        // Git writes progress to stderr, not all is errors
        errorOutput += data.toString()
      })

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, output: output || errorOutput })
        } else {
          resolve({ success: false, output: '', error: errorOutput })
        }
      })

      proc.on('error', (err) => {
        resolve({ success: false, output: '', error: err.message })
      })
    })
  }

  /**
   * Checkout a branch, creating it if it doesn't exist
   */
  checkoutOrCreateBranch(projectId: string, repoUrl: string, branchName: string): GitResult {
    const repoPath = this.getRepoPath(projectId, repoUrl)

    if (!existsSync(repoPath)) {
      return { success: false, output: '', error: 'Repository not cloned' }
    }

    // First, try to checkout the branch if it exists locally
    const checkoutLocal = this.execGit(`git checkout ${branchName}`, repoPath)
    if (checkoutLocal.success) {
      // Pull latest if tracking remote
      this.execGit('git pull origin --ff-only', repoPath)
      return { success: true, output: `Switched to existing branch ${branchName}` }
    }

    // Try to checkout from remote
    const checkoutRemote = this.execGit(`git checkout -b ${branchName} origin/${branchName}`, repoPath)
    if (checkoutRemote.success) {
      return { success: true, output: `Checked out remote branch ${branchName}` }
    }

    // Branch doesn't exist locally or remotely, create it from current HEAD
    const createBranch = this.execGit(`git checkout -b ${branchName}`, repoPath)
    if (createBranch.success) {
      return { success: true, output: `Created new branch ${branchName}` }
    }

    return createBranch
  }

  /**
   * Create a new branch for the project
   */
  createBranch(projectId: string, repoUrl: string, branchName: string, baseBranch: string): GitResult {
    const repoPath = this.getRepoPath(projectId, repoUrl)

    if (!existsSync(repoPath)) {
      return { success: false, output: '', error: 'Repository not cloned' }
    }

    // First, check if branch exists on remote (from previous run)
    const remoteExists = this.remoteBranchExists(projectId, repoUrl, branchName)

    if (remoteExists) {
      // Branch exists on remote - check it out and pull to continue from previous work
      const checkoutRemote = this.execGit(`git checkout -b ${branchName} origin/${branchName}`, repoPath)
      if (checkoutRemote.success) {
        return { success: true, output: `Checked out existing remote branch ${branchName}` }
      }
      // If that failed, branch might exist locally too - just checkout and pull
      const checkout = this.execGit(`git checkout ${branchName}`, repoPath)
      if (checkout.success) {
        this.execGit(`git pull origin ${branchName}`, repoPath)
        return { success: true, output: `Switched to existing branch ${branchName} and pulled latest` }
      }
      return checkout
    }

    // Branch doesn't exist on remote - create from base branch
    // Checkout base branch first
    const checkoutBase = this.execGit(`git checkout ${baseBranch}`, repoPath)
    if (!checkoutBase.success) {
      return checkoutBase
    }

    // Pull latest changes from base
    const pull = this.execGit(`git pull origin ${baseBranch}`, repoPath)
    if (!pull.success) {
      // Pull might fail if not on a tracking branch, continue anyway
      console.log('Pull warning:', pull.error)
    }

    // Create and checkout new branch
    const createBranch = this.execGit(`git checkout -b ${branchName}`, repoPath)
    if (!createBranch.success) {
      // Branch might already exist locally, try to just checkout
      const checkout = this.execGit(`git checkout ${branchName}`, repoPath)
      if (!checkout.success) {
        return checkout
      }
      return { success: true, output: `Switched to existing branch ${branchName}` }
    }

    return createBranch
  }

  /**
   * Stage and commit changes
   */
  commit(projectId: string, repoUrl: string, message: string): GitResult {
    const repoPath = this.getRepoPath(projectId, repoUrl)

    if (!existsSync(repoPath)) {
      return { success: false, output: '', error: 'Repository not cloned' }
    }

    // Stage all changes
    const add = this.execGit('git add -A', repoPath)
    if (!add.success) {
      return add
    }

    // Check if there are changes to commit
    const status = this.execGit('git status --porcelain', repoPath)
    if (status.success && !status.output.trim()) {
      return { success: true, output: 'No changes to commit' }
    }

    // Commit with co-author
    const fullMessage = `${message}\n\nCo-Authored-By: Claude <noreply@anthropic.com>`
    const commit = this.execGit(`git commit -m "${fullMessage.replace(/"/g, '\\"')}"`, repoPath)
    return commit
  }

  /**
   * Push changes to remote
   */
  push(projectId: string, repoUrl: string, branchName: string): GitResult {
    const repoPath = this.getRepoPath(projectId, repoUrl)

    if (!existsSync(repoPath)) {
      return { success: false, output: '', error: 'Repository not cloned' }
    }

    // First, try to rebase on top of any remote changes to avoid non-fast-forward errors
    // This handles cases where previous runs pushed commits that we need to incorporate
    if (this.remoteBranchExists(projectId, repoUrl, branchName)) {
      this.execGit(`git pull --rebase origin ${branchName}`, repoPath)
    }

    return this.execGit(`git push -u origin ${branchName}`, repoPath)
  }

  /**
   * Get the current status of the repo
   */
  getStatus(projectId: string, repoUrl: string): GitResult {
    const repoPath = this.getRepoPath(projectId, repoUrl)

    if (!existsSync(repoPath)) {
      return { success: false, output: '', error: 'Repository not cloned' }
    }

    return this.execGit('git status', repoPath)
  }

  /**
   * Get the diff of changes
   */
  getDiff(projectId: string, repoUrl: string): GitResult {
    const repoPath = this.getRepoPath(projectId, repoUrl)

    if (!existsSync(repoPath)) {
      return { success: false, output: '', error: 'Repository not cloned' }
    }

    return this.execGit('git diff HEAD', repoPath)
  }

  /**
   * Get commits in current branch that are not in the base branch
   */
  getDiffFromBase(projectId: string, repoUrl: string, baseBranch: string): GitResult {
    const repoPath = this.getRepoPath(projectId, repoUrl)

    if (!existsSync(repoPath)) {
      return { success: false, output: '', error: 'Repository not cloned' }
    }

    // Get list of commits in current branch but not in base branch
    return this.execGit(`git log origin/${baseBranch}..HEAD --oneline`, repoPath)
  }

  /**
   * Get current branch name
   */
  getCurrentBranch(projectId: string, repoUrl: string): GitResult {
    const repoPath = this.getRepoPath(projectId, repoUrl)

    if (!existsSync(repoPath)) {
      return { success: false, output: '', error: 'Repository not cloned' }
    }

    return this.execGit('git branch --show-current', repoPath)
  }

  /**
   * Clean up workspace for a project
   */
  cleanupWorkspace(projectId: string): GitResult {
    const workspacePath = this.getProjectWorkspace(projectId)

    if (!existsSync(workspacePath)) {
      return { success: true, output: 'Workspace does not exist' }
    }

    try {
      rmSync(workspacePath, { recursive: true, force: true })
      return { success: true, output: `Cleaned up workspace at ${workspacePath}` }
    } catch (error) {
      const err = error as Error
      return { success: false, output: '', error: err.message }
    }
  }

  /**
   * Setup the .ralph folder structure in a workspace
   * Creates .ralph/ directory with tasks.json, logs.json, and .gitignore
   * This method is idempotent - it won't overwrite existing files
   */
  setupRalphFolder(projectId: string, repoUrl: string): GitResult {
    const repoPath = this.getRepoPath(projectId, repoUrl)

    // Check if repo exists
    if (!existsSync(repoPath)) {
      return { success: false, output: '', error: 'Repository not cloned' }
    }

    const ralphPath = join(repoPath, '.ralph')

    try {
      // Create .ralph directory if it doesn't exist
      if (!existsSync(ralphPath)) {
        mkdirSync(ralphPath, { recursive: true })
      }

      // Create .gitignore if it doesn't exist (always ensure this exists)
      const gitignorePath = join(ralphPath, '.gitignore')
      if (!existsSync(gitignorePath)) {
        writeFileSync(gitignorePath, '*\n', 'utf-8')
      }

      // Create tasks.json with empty structure only if it doesn't exist
      const tasksPath = join(ralphPath, 'tasks.json')
      if (!existsSync(tasksPath)) {
        const tasksContent = JSON.stringify({ project: {}, tasks: [] }, null, 2)
        writeFileSync(tasksPath, tasksContent, 'utf-8')
      }

      // Create logs.json with empty structure only if it doesn't exist
      const logsPath = join(ralphPath, 'logs.json')
      if (!existsSync(logsPath)) {
        const logsContent = JSON.stringify({ entries: [] }, null, 2)
        writeFileSync(logsPath, logsContent, 'utf-8')
      }

      return { success: true, output: `Ensured .ralph folder exists at ${ralphPath}` }
    } catch (error) {
      const err = error as Error
      return { success: false, output: '', error: `Failed to setup .ralph folder: ${err.message}` }
    }
  }

  /**
   * Check if workspace exists for a project (must be a valid git repo)
   */
  workspaceExists(projectId: string, repoUrl: string): boolean {
    const repoPath = this.getRepoPath(projectId, repoUrl)
    const gitPath = join(repoPath, '.git')
    return existsSync(repoPath) && existsSync(gitPath)
  }

  /**
   * Check if a branch exists on the remote
   */
  remoteBranchExists(projectId: string, repoUrl: string, branchName: string): boolean {
    const repoPath = this.getRepoPath(projectId, repoUrl)

    if (!existsSync(repoPath)) {
      return false
    }

    const result = this.execGit(`git ls-remote --heads origin ${branchName}`, repoPath)
    return result.success && result.output.trim().length > 0
  }

  /**
   * Push a branch to remote (used for ensuring base branch exists)
   */
  pushBranch(projectId: string, repoUrl: string, branchName: string): GitResult {
    const repoPath = this.getRepoPath(projectId, repoUrl)

    if (!existsSync(repoPath)) {
      return { success: false, output: '', error: 'Repository not cloned' }
    }

    return this.execGit(`git push -u origin ${branchName}`, repoPath)
  }

  /**
   * Merge a branch into the current branch
   */
  mergeBranch(projectId: string, repoUrl: string, sourceBranch: string): GitResult {
    const repoPath = this.getRepoPath(projectId, repoUrl)

    if (!existsSync(repoPath)) {
      return { success: false, output: '', error: 'Repository not cloned' }
    }

    // Fetch latest from remote first
    this.execGit('git fetch origin', repoPath)

    // Try to merge the source branch (use origin/sourceBranch to get remote version)
    const mergeResult = this.execGit(
      `git merge origin/${sourceBranch} --no-edit -m "Merge ${sourceBranch} into current branch"`,
      repoPath
    )

    return mergeResult
  }

  /**
   * Checkout a branch, creating it from a source branch if it doesn't exist
   */
  checkoutOrCreateFromSource(
    projectId: string,
    repoUrl: string,
    branchName: string,
    sourceBranch: string
  ): GitResult {
    const repoPath = this.getRepoPath(projectId, repoUrl)

    if (!existsSync(repoPath)) {
      return { success: false, output: '', error: 'Repository not cloned' }
    }

    // First, try to checkout the branch if it exists locally
    const checkoutLocal = this.execGit(`git checkout ${branchName}`, repoPath)
    if (checkoutLocal.success) {
      // Pull latest if tracking remote
      this.execGit(`git pull origin ${branchName} --ff-only`, repoPath)
      return { success: true, output: `Switched to existing branch ${branchName}` }
    }

    // Try to checkout from remote
    const checkoutRemote = this.execGit(`git checkout -b ${branchName} origin/${branchName}`, repoPath)
    if (checkoutRemote.success) {
      return { success: true, output: `Checked out remote branch ${branchName}` }
    }

    // Branch doesn't exist locally or remotely - create from source branch
    // First make sure we have the latest source branch
    this.execGit('git fetch origin', repoPath)

    // Create new branch from origin/sourceBranch
    const createFromSource = this.execGit(
      `git checkout -b ${branchName} origin/${sourceBranch}`,
      repoPath
    )
    if (createFromSource.success) {
      return { success: true, output: `Created new branch ${branchName} from ${sourceBranch}` }
    }

    // If that fails, try local source branch
    const createFromLocalSource = this.execGit(
      `git checkout -b ${branchName} ${sourceBranch}`,
      repoPath
    )
    if (createFromLocalSource.success) {
      return { success: true, output: `Created new branch ${branchName} from local ${sourceBranch}` }
    }

    return createFromLocalSource
  }
}

// Singleton
let repoManager: RepoManager | null = null

export function getRepoManager(): RepoManager {
  if (!repoManager) {
    repoManager = new RepoManager()
  }
  return repoManager
}
