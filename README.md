# Ralph AI Orchestrator

A desktop application that orchestrates autonomous coding agents using [Claude Code](https://claude.ai/code). Built with Electron and React.

## About

Ralph AI Orchestrator is a graphical interface for managing multiple autonomous coding projects. It implements the "Ralph" technique pioneered by [Geoffrey Huntley](https://ghuntley.com/ralph), which uses Claude Code in an iterative loop to autonomously complete software development tasks.

### The Ralph Concept

The original Ralph technique is beautifully simple:

```bash
while :; do cat PROMPT.md | npx --yes @sourcegraph/amp ; done
```

This simple loop embodies a powerful philosophy: **iteration beats perfection**. Rather than trying to get everything right in one attempt, Ralph continuously retries tasks until they succeed. As Geoffrey Huntley puts it, being "deterministically bad in an undeterministic world" allows the system to converge on solutions through persistence.

Ralph AI Orchestrator takes this concept and builds a full project management system around it, adding:

- **Task Management** - Break projects into discrete tasks with acceptance criteria
- **Verification** - Automatic testing and Claude self-review to validate completions
- **Repository Management** - Clone, branch, commit, and create PRs automatically
- **Progress Tracking** - Visual kanban board to monitor task status
- **Multi-Project Support** - Run multiple projects in parallel

## Prerequisites

- **Claude Code CLI** - Install from [claude.ai/code](https://claude.ai/code)
- **GitHub CLI** (optional) - For automatic PR creation. Install from [cli.github.com](https://cli.github.com)
- **Node.js 18+**

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/ralph-orchestrator-ui.git
cd ralph-orchestrator-ui

# Install dependencies
npm install

# Start the development server
npm run dev
```

## Building

```bash
# Build for production
npm run build

# Package as a distributable app (macOS)
npm run package
```

## Usage

1. **Add a Repository** - Click "Add Repository" and select from your GitHub repos
2. **Create a Project** - Click "+" on a repository to create a new project
3. **Configure the Project** - Add a product brief, solution brief, and working branch
4. **Add Tasks** - Create tasks with clear titles, descriptions, and acceptance criteria
5. **Start the Project** - Click "Start" to begin autonomous execution

The orchestrator will:
- Clone the repository and create a working branch
- Pick up tasks in priority order
- Run Claude Code with a structured prompt for each task
- Verify completions using tests and self-review
- Retry failed tasks up to the configured limit
- Push changes and create a PR when all tasks are complete

## Documentation

- [How the Orchestrator Works](docs/description.md) - Detailed explanation of the task execution mechanism
- [Prompt Templates](docs/prompts.md) - Documentation of the prompts used for tasks and verification

## Architecture

The application is built with:

- **Electron** - Cross-platform desktop framework
- **React** - UI components
- **Zustand** - State management
- **Tailwind CSS** - Styling
- **electron-vite** - Build tooling

Key components:

- `electron/orchestrator/Orchestrator.ts` - Main orchestration loop
- `electron/orchestrator/Verifier.ts` - Task verification logic
- `electron/orchestrator/ProcessManager.ts` - Claude Code process management
- `electron/orchestrator/RepoManager.ts` - Git operations
- `electron/orchestrator/StateManager.ts` - Persistent state management

## License

MIT

## Acknowledgments

- [Geoffrey Huntley](https://ghuntley.com) for the Ralph AI concept
- [Anthropic](https://anthropic.com) for Claude and Claude Code
