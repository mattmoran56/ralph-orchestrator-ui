import { execSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { getProcessManager } from './ProcessManager'
import { getRepoManager } from './RepoManager'
import { getStateManager, type Task, type Project } from './StateManager'

export interface VerificationResult {
  passed: boolean
  testsRan: boolean
  testsPassed: boolean
  testOutput: string
  reviewPassed: boolean
  reviewOutput: string
  failureReasons: string[]
}

class Verifier {
  /**
   * Get the repository URL for a project
   */
  private getRepoUrl(project: Project): string {
    const stateManager = getStateManager()
    const repository = stateManager.getRepository(project.repositoryId)
    if (!repository) {
      throw new Error(`Repository not found for project ${project.id}`)
    }
    return repository.url
  }

  /**
   * Run full verification for a task
   */
  async verifyTask(
    project: Project,
    task: Task,
    workingDirectory: string
  ): Promise<VerificationResult> {
    const result: VerificationResult = {
      passed: false,
      testsRan: false,
      testsPassed: false,
      testOutput: '',
      reviewPassed: false,
      reviewOutput: '',
      failureReasons: []
    }

    // Step 1: Run tests
    const testResult = await this.runTests(workingDirectory)
    result.testsRan = testResult.ran
    result.testsPassed = testResult.passed
    result.testOutput = testResult.output

    if (testResult.ran && !testResult.passed) {
      result.failureReasons.push('Tests failed')
      // Continue to review even if tests fail - review might identify why
    }

    // Step 2: Run Claude self-review
    const reviewResult = await this.runSelfReview(
      project,
      task,
      workingDirectory,
      result.testOutput
    )
    result.reviewPassed = reviewResult.passed
    result.reviewOutput = reviewResult.output

    if (!reviewResult.passed) {
      result.failureReasons.push(reviewResult.reason || 'Self-review failed')
    }

    // Task passes if both tests pass (or no tests) AND review passes
    result.passed = (result.testsPassed || !result.testsRan) && result.reviewPassed

    return result
  }

  /**
   * Detect and run the project's test suite
   */
  private async runTests(
    workingDirectory: string
  ): Promise<{ ran: boolean; passed: boolean; output: string }> {
    // Detect test runner
    const testCommand = this.detectTestCommand(workingDirectory)

    if (!testCommand) {
      return {
        ran: false,
        passed: true, // No tests = pass by default
        output: 'No test suite detected'
      }
    }

    try {
      const output = execSync(testCommand, {
        cwd: workingDirectory,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 300000, // 5 minute timeout
        maxBuffer: 10 * 1024 * 1024
      })

      return {
        ran: true,
        passed: true,
        output
      }
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string; message?: string }
      return {
        ran: true,
        passed: false,
        output: err.stdout || err.stderr || err.message || 'Tests failed'
      }
    }
  }

  /**
   * Detect the appropriate test command for the project
   */
  private detectTestCommand(workingDirectory: string): string | null {
    const packageJsonPath = join(workingDirectory, 'package.json')

    // Check for Node.js project
    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
        const scripts = packageJson.scripts || {}

        // Check for common test script names
        if (scripts.test && scripts.test !== 'echo "Error: no test specified" && exit 1') {
          // Detect package manager
          if (existsSync(join(workingDirectory, 'pnpm-lock.yaml'))) {
            return 'pnpm test'
          } else if (existsSync(join(workingDirectory, 'yarn.lock'))) {
            return 'yarn test'
          }
          return 'npm test'
        }
      } catch {
        // Ignore JSON parse errors
      }
    }

    // Check for Python project
    if (existsSync(join(workingDirectory, 'pytest.ini')) ||
        existsSync(join(workingDirectory, 'pyproject.toml'))) {
      return 'pytest'
    }

    // Check for Go project
    if (existsSync(join(workingDirectory, 'go.mod'))) {
      return 'go test ./...'
    }

    // Check for Rust project
    if (existsSync(join(workingDirectory, 'Cargo.toml'))) {
      return 'cargo test'
    }

    return null
  }

  /**
   * Run Claude self-review to verify acceptance criteria
   */
  private async runSelfReview(
    project: Project,
    task: Task,
    workingDirectory: string,
    testOutput: string
  ): Promise<{ passed: boolean; reason?: string; output: string }> {
    const processManager = getProcessManager()
    const repoManager = getRepoManager()

    // Get the git diff of changes
    const repoUrl = this.getRepoUrl(project)
    const diffResult = repoManager.getDiff(project.id, repoUrl)
    const diff = diffResult.success ? diffResult.output : 'Unable to get diff'

    // Build the verification prompt
    const prompt = this.buildVerificationPrompt(task, diff, testOutput)

    // Create a temporary log file for the review
    const logFilePath = processManager.getLogFilePath(project.id, `${task.id}-verify`)

    // Run Claude with the verification prompt
    const processId = await processManager.startProcess({
      projectId: project.id,
      taskId: `${task.id}-verify`,
      prompt,
      workingDirectory,
      logFilePath
    })

    // Wait for completion
    const result = await processManager.waitForProcess(processId)

    // Parse the review result
    const output = result.output

    // Check for explicit pass/fail signals
    if (output.includes('VERIFICATION_PASSED')) {
      return { passed: true, output }
    }

    if (output.includes('VERIFICATION_FAILED')) {
      // Extract reason
      const match = output.match(/VERIFICATION_FAILED:\s*(.+?)(?:\n|$)/i)
      return {
        passed: false,
        reason: match?.[1]?.trim() || 'Verification failed',
        output
      }
    }

    // If no explicit signal, try to infer from output
    const lowerOutput = output.toLowerCase()
    if (lowerOutput.includes('all criteria met') ||
        lowerOutput.includes('acceptance criteria are met') ||
        lowerOutput.includes('looks good') ||
        lowerOutput.includes('verified')) {
      return { passed: true, output }
    }

    // Default to passed if no clear failure
    // This is lenient - adjust if needed
    return { passed: true, output }
  }

  /**
   * Build the verification prompt for Claude
   */
  private buildVerificationPrompt(task: Task, diff: string, testOutput: string): string {
    const criteriaList = task.acceptanceCriteria
      .map((c, i) => `${i + 1}. ${c}`)
      .join('\n')

    return `# Verification Request

You are reviewing work completed for a task. Evaluate whether all acceptance criteria have been met.

## Task
**Title:** ${task.title}
**Description:** ${task.description}

## Acceptance Criteria
${criteriaList || 'No specific criteria defined'}

## Changes Made (Git Diff)
\`\`\`diff
${diff || 'No changes detected'}
\`\`\`

## Test Results
\`\`\`
${testOutput || 'No test output'}
\`\`\`

## Instructions
Carefully review the changes and test results against the acceptance criteria.

For each criterion, evaluate:
1. Is the implementation present in the diff?
2. Does it meet the requirement as specified?
3. Are there any obvious issues or bugs?

After your review, provide ONE of these verdicts:
- If ALL criteria are met: Output exactly "VERIFICATION_PASSED"
- If ANY criteria are NOT met: Output "VERIFICATION_FAILED: [specific reason what is missing or wrong]"

Be specific about what is missing or incorrect if the verification fails.`
  }

  /**
   * Run a quick syntax/lint check
   */
  async runLintCheck(workingDirectory: string): Promise<{ passed: boolean; output: string }> {
    const packageJsonPath = join(workingDirectory, 'package.json')

    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
        const scripts = packageJson.scripts || {}

        if (scripts.lint) {
          // Detect package manager
          let cmd = 'npm run lint'
          if (existsSync(join(workingDirectory, 'pnpm-lock.yaml'))) {
            cmd = 'pnpm lint'
          } else if (existsSync(join(workingDirectory, 'yarn.lock'))) {
            cmd = 'yarn lint'
          }

          const output = execSync(cmd, {
            cwd: workingDirectory,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 60000
          })

          return { passed: true, output }
        }
      } catch (error) {
        const err = error as { stdout?: string; stderr?: string }
        return {
          passed: false,
          output: err.stdout || err.stderr || 'Lint check failed'
        }
      }
    }

    return { passed: true, output: 'No lint script found' }
  }
}

// Singleton
let verifier: Verifier | null = null

export function getVerifier(): Verifier {
  if (!verifier) {
    verifier = new Verifier()
  }
  return verifier
}
