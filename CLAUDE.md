# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ralph AI Orchestrator is an Electron + React desktop application that orchestrates Claude Code CLI to autonomously work through project tasks. It provides a Kanban-style interface for managing tasks within software projects.

## Commands

```bash
npm run dev          # Start dev server with hot reload
npm run build        # Build for production (outputs to out/)
npm run typecheck    # Run TypeScript type checking
npm run lint         # Run ESLint
npm run package      # Package app with electron-builder
npm run package:mac  # Package macOS DMG
```

## Architecture

### Three-Process Electron Structure

1. **Main Process** (`electron/main/`) - App lifecycle, IPC handlers, orchestration
2. **Preload Script** (`electron/preload/`) - Secure context bridge exposing `electronAPI`
3. **Renderer Process** (`src/`) - React SPA with Zustand state management

### Orchestrator Backend (`electron/orchestrator/`)

- **Orchestrator.ts** - Main automation loop that processes tasks
- **StateManager.ts** - Persistent JSON state at `~/.config/ralph/data/state.json`
- **ProcessManager.ts** - Spawns Claude CLI processes
- **RepoManager.ts** - Git repository operations
- **Verifier.ts** - Task completion verification

### UI Structure (`src/`)

Three-column layout: Projects list → Kanban board (5 columns) → Task detail panel

- **stores/projectStore.ts** - Zustand store for projects/tasks/settings
- **hooks/useElectronSync.ts** - IPC communication with main process
- **components/** - ProjectPanel, Kanban, TaskPanel

### IPC Communication

Renderer communicates via `window.electronAPI` (defined in preload). All handlers registered in `electron/main/ipc.ts`.

## Key Types (`src/types/index.ts`)

- **ProjectStatus**: `'idle' | 'running' | 'paused' | 'completed' | 'failed'`
- **TaskStatus**: `'backlog' | 'in_progress' | 'verifying' | 'done' | 'blocked'`
- **ElectronAPI**: Type contract for IPC methods exposed to renderer

## Path Aliases

- `@/*` → `src/*`
- `@electron/*` → `electron/*`

## File Storage

App data stored in `~/.config/ralph/`:
- `data/state.json` - Persistent application state
- `logs/` - Task execution logs
- `workspaces/` - Cloned git repositories

## Styling

Tailwind CSS with custom "ralph" color palette (blue shades). Dark mode supported via `dark:` prefixes.
