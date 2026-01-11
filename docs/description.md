# How the Orchestrator Works

This document explains the complete task execution mechanism in Ralph AI Orchestrator.

## Overview

The orchestrator manages autonomous coding projects by:

1. Setting up a git repository workspace
2. Selecting tasks based on priority and status
3. Executing each task using Claude Code
4. Verifying task completion through tests and self-review
5. Committing changes and managing retries
6. Creating a pull request when all tasks are complete

## Data Model

### Repositories

Repositories are GitHub repositories that you want to work with. They store:

- **name** - Repository name (e.g., "ralph-orchestrator-ui")
- **nameWithOwner** - Full path (e.g., "matt/ralph-orchestrator-ui")
- **url** - GitHub URL
- **baseBranch** - Default branch for new projects

### Projects

A project represents a unit of work within a repository. Each project has:

- **productBrief** - High-level description of what should be built
- **solutionBrief** - Technical approach and architecture
- **baseBranch** - Branch to create the working branch from
- **workingBranch** - Auto-generated branch where work happens (e.g., `ralph/my-feature-1736612345`)
- **tasks** - List of tasks to complete

### Tasks

Tasks are discrete units of work. Each task has:

- **title** - Brief description
- **description** - Detailed requirements
- **acceptanceCriteria** - List of conditions that must be met
- **status** - Current state: `backlog`, `in_progress`, `verifying`, `done`, or `blocked`
- **priority** - Order in which tasks are picked up (lower = higher priority)
- **attempts** - Number of times the task has been attempted
- **logs** - History of execution attempts

## Execution Flow

### 1. Project Startup

When you click "Start" on a project:

```
startProject(projectId)
├── Check parallel project limit (default: 3)
├── Create orchestrator state
├── Update project status to "running"
└── Start the run loop
```

### 2. Repository Setup

The orchestrator prepares the workspace:

```
setupRepository(project)
├── Clone repository (if not exists)
│   └── git clone <url> to ~/Library/Application Support/ralph-orchestrator-ui/workspaces/<projectId>/
├── Checkout base branch
│   └── git checkout <baseBranch> (creates if doesn't exist)
└── Create working branch
    └── git checkout -b <workingBranch> from <baseBranch>
```

### 3. Task Selection

The `getNextTask()` function determines which task to work on:

```
Priority Order:
1. Task with status "in_progress" (resume interrupted work)
2. Task with status "verifying" (retry failed verification)
3. First task with status "backlog" sorted by priority (lowest number first)

If no tasks remain → Project is complete
```

### 4. Task Execution

For each task:

```
workOnTask(project, task, workingDirectory)
├── Update task status to "in_progress"
├── Increment attempt counter
├── Build task prompt (see prompts.md)
├── Start Claude Code process
│   └── claude --print --dangerously-skip-permissions "<prompt>"
├── Wait for process completion
├── Parse output for signals:
│   ├── TASK_COMPLETE → Move to verification
│   └── TASK_BLOCKED: <reason> → Handle blocker
└── Handle result
```

### 5. Verification

When Claude reports `TASK_COMPLETE`:

```
verifyTask(project, task, workingDirectory)
├── Run Tests
│   ├── Detect test runner (npm test, pytest, go test, cargo test)
│   └── Execute and capture output
├── Run Self-Review
│   ├── Get git diff of changes
│   ├── Build verification prompt
│   ├── Run Claude Code with diff + test output
│   └── Parse for VERIFICATION_PASSED or VERIFICATION_FAILED
└── Determine Result
    ├── Tests pass (or no tests) AND review passes → Task Done
    └── Otherwise → Retry or Block
```

### 6. Result Handling

Based on verification outcome:

```
If VERIFICATION_PASSED:
├── Update task status to "done"
├── Add success log entry
└── Commit changes: "Complete task: <title>"

If VERIFICATION_FAILED:
├── Check attempt count vs maxTaskAttempts (default: 3)
├── If under limit:
│   ├── Keep status "in_progress"
│   └── Add failure log with reason
└── If at/over limit:
    ├── Update status to "blocked"
    └── Move to next task
```

### 7. Project Completion

When no tasks remain:

```
completeProject(project, workingDirectory)
├── Count completed vs blocked tasks
├── If no completed tasks → Skip PR
├── Check for actual changes (git diff)
├── If no changes → Skip PR
├── Push base branch (if not on remote)
├── Push working branch
├── Create Pull Request
│   ├── Title: "[Ralph] <project name>"
│   ├── Body: Summary of completed tasks
│   └── Target: base branch
├── Update project status to "completed" or "failed"
└── Clean up workspace (delete cloned repo)
```

## State Transitions

### Project Status

```
idle → running → completed
          ↓         ↑
       paused  →   │
          ↓         │
       failed  ────┘
```

### Task Status

```
backlog → in_progress → verifying → done
              ↑             │
              └─────────────┘ (retry on failure)

              ↓
          blocked (max attempts reached)
```

## Process Management

Claude Code is executed via the ProcessManager:

```typescript
startProcess({
  projectId,
  taskId,
  prompt,
  workingDirectory,
  logFilePath
})
```

The process runs:
```bash
claude --print --dangerously-skip-permissions "<prompt>"
```

- `--print` - Output goes to stdout (captured in log file)
- `--dangerously-skip-permissions` - Allows autonomous file operations

Output is monitored for:
- `TASK_COMPLETE` - Task reports it finished successfully
- `TASK_BLOCKED: <reason>` - Task encountered a blocker

## Configuration

Settings are stored in `~/Library/Application Support/ralph-orchestrator-ui/data/state.json`:

| Setting | Default | Description |
|---------|---------|-------------|
| `maxParallelProjects` | 3 | Maximum concurrent projects |
| `maxTaskAttempts` | 3 | Retry limit before blocking a task |
| `workspacesPath` | `<userData>/workspaces` | Where repos are cloned |
| `claudeExecutable` | `claude` | Path to Claude Code CLI |

## Error Handling

- **Repository clone fails** - Project marked as "failed"
- **Claude process crashes** - Task attempt logged, retry on next loop
- **Git push fails** - Project marked as "failed", workspace cleaned up
- **PR creation fails** - Project marked as "failed", work is still pushed

## Parallel Execution

Multiple projects can run simultaneously up to `maxParallelProjects`. Each project:
- Has its own working directory
- Runs its own orchestration loop
- Maintains independent state
- Can be stopped/paused individually

## Resuming Work

If the application is closed while a project is running:
- Project status will be "running" in state
- On next start, you need to manually restart the project
- Tasks in "in_progress" will be resumed (not reset to backlog)
- Workspace persists until project completes or is deleted
