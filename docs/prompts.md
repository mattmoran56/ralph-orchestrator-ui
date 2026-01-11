# Prompt Templates

This document describes the prompts used by Ralph AI Orchestrator when interacting with Claude Code.

## Task Execution Prompt

When executing a task, the orchestrator builds a structured prompt that provides Claude with all necessary context.

### Template

```markdown
# Project Context

{productBrief}

# Solution Overview

{solutionBrief}

# Current Task

**Title:** {task.title}
**Description:** {task.description}

## Acceptance Criteria
1. {criterion1}
2. {criterion2}
...

# Instructions

Work through this task completely. Follow these guidelines:

1. Read and understand the existing codebase structure
2. Implement the required changes
3. Write clean, well-documented code
4. Test your changes work as expected
5. Commit your changes with clear, descriptive commit messages

When you have completed the task and believe all acceptance criteria are met, output: TASK_COMPLETE

If you encounter a blocker that prevents you from completing the task (missing dependencies, unclear requirements, external service issues), output: TASK_BLOCKED: [describe the blocker]

# Other Tasks (for context only - do NOT work on these)
- [status] Task title 1
- [status] Task title 2
...

# Important Notes
- Focus only on the current task
- Do not push to remote - commits only
- If tests exist, make sure they pass
- Follow existing code patterns and conventions
```

### Variables

| Variable | Source | Description |
|----------|--------|-------------|
| `productBrief` | `project.productBrief` | High-level description of what's being built |
| `solutionBrief` | `project.solutionBrief` | Technical approach and architecture |
| `task.title` | Current task | Brief task name |
| `task.description` | Current task | Detailed requirements |
| `acceptanceCriteria` | `task.acceptanceCriteria[]` | Numbered list of conditions |
| Other tasks | `project.tasks` (excluding current) | Context about related work |

### Signal Keywords

The orchestrator monitors Claude's output for these signals:

- **`TASK_COMPLETE`** - Claude believes the task is finished and all acceptance criteria are met. Triggers the verification phase.

- **`TASK_BLOCKED: <reason>`** - Claude encountered an issue that prevents completion. The task will be retried (if under attempt limit) or marked as blocked.

---

## Verification Prompt

After a task reports completion, the orchestrator runs a verification step using a separate Claude invocation.

### Template

```markdown
# Verification Request

You are reviewing work completed for a task. Evaluate whether all acceptance criteria have been met.

## Task
**Title:** {task.title}
**Description:** {task.description}

## Acceptance Criteria
1. {criterion1}
2. {criterion2}
...

## Changes Made (Git Diff)
```diff
{gitDiff}
```

## Test Results
```
{testOutput}
```

## Instructions
Carefully review the changes and test results against the acceptance criteria.

For each criterion, evaluate:
1. Is the implementation present in the diff?
2. Does it meet the requirement as specified?
3. Are there any obvious issues or bugs?

After your review, provide ONE of these verdicts:
- If ALL criteria are met: Output exactly "VERIFICATION_PASSED"
- If ANY criteria are NOT met: Output "VERIFICATION_FAILED: [specific reason what is missing or wrong]"

Be specific about what is missing or incorrect if the verification fails.
```

### Variables

| Variable | Source | Description |
|----------|--------|-------------|
| `task.title` | Current task | Task being verified |
| `task.description` | Current task | Task requirements |
| `acceptanceCriteria` | `task.acceptanceCriteria[]` | Conditions to verify |
| `gitDiff` | `git diff` output | All changes in the working tree |
| `testOutput` | Test runner output | Results from running the test suite |

### Signal Keywords

- **`VERIFICATION_PASSED`** - All acceptance criteria are met. Task is marked as "done" and changes are committed.

- **`VERIFICATION_FAILED: <reason>`** - One or more criteria are not met. The specific reason is logged, and the task is retried if under the attempt limit.

### Fallback Detection

If Claude doesn't output explicit signals, the verifier looks for implicit indicators:

**Implicit pass signals:**
- "all criteria met"
- "acceptance criteria are met"
- "looks good"
- "verified"

**Default behavior:** If no clear failure is detected, the verifier defaults to passed (lenient mode).

---

## Test Detection

The verifier automatically detects and runs the project's test suite:

| Project Type | Detection | Command |
|--------------|-----------|---------|
| Node.js (npm) | `package.json` with test script | `npm test` |
| Node.js (pnpm) | `pnpm-lock.yaml` | `pnpm test` |
| Node.js (yarn) | `yarn.lock` | `yarn test` |
| Python | `pytest.ini` or `pyproject.toml` | `pytest` |
| Go | `go.mod` | `go test ./...` |
| Rust | `Cargo.toml` | `cargo test` |

If no test suite is detected, the test phase is skipped and only the self-review determines pass/fail.

---

## Best Practices for Acceptance Criteria

Good acceptance criteria improve verification accuracy:

**Be specific:**
- "Add a login button to the header" (good)
- "Improve the UI" (too vague)

**Be testable:**
- "All existing tests pass" (verifiable)
- "Code quality is good" (subjective)

**Be complete:**
- "Button displays loading state while authenticating"
- "Error message appears on invalid credentials"
- "User is redirected to dashboard on success"

**Include edge cases:**
- "Handle empty input gracefully"
- "Show error if API returns 500"

---

## Customization

The prompts are defined in:
- Task prompt: `electron/orchestrator/Orchestrator.ts` → `buildTaskPrompt()`
- Verification prompt: `electron/orchestrator/Verifier.ts` → `buildVerificationPrompt()`

To modify the prompts, edit these methods directly. Changes take effect on the next task execution.
