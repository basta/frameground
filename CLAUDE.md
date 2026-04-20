# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is this

OpenDesign is a Figma-like design tool built on React Flow (`@xyflow/react`). The canvas hosts "frames" — each frame renders a self-contained HTML file via an iframe. Frames are defined in a JSON manifest and synced to the canvas automatically.

The intended workflow: the user describes a frame, Claude creates the HTML file and updates the manifest, and it appears on the canvas within seconds.

## Commands

- `npm run dev` — start dev server (default: http://localhost:5173)
- `npm run build` — type-check and build for production
- `npm run lint` — run ESLint
- `npx tsc --noEmit` — type-check only
- `FRAMES_DIR=/path/to/project npm run dev` — serve frames from an external directory

## Architecture

**Custom node system**: `HtmlFrameNode` is a custom React Flow node type (`html-frame`). It renders an iframe with a title bar (name + refresh button). Double-click enters edit mode, enabling iframe interaction. Defined in `src/shapes/HtmlFrameNode.tsx`, typed in `src/shapes/HtmlFrameShape.ts`.

**Manifest-driven sync**: `useFrameSync` hook polls `/frames/frames.json` every 3 seconds. It uses manifest entry IDs directly as node IDs, so it only creates nodes that don't already exist (user-repositioned frames are preserved). It never deletes nodes from the canvas.

**Frame serving**: `vite.config.ts` has a custom plugin that serves files from `FRAMES_DIR` (env var) at the `/frames/` path. Falls back to `public/frames/` if unset.

## Skill: `/frame`

The `/frame` skill (defined in `skills/frame.md` and `.claude/skills/frame/SKILL.md`) handles creating frames. It writes a self-contained HTML file and updates `frames.json` in the project directory. Frame HTML files must be fully self-contained (inline CSS/JS, no external deps unless requested).
