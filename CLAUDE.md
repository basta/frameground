# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is this

OpenDesign is a Figma-like design tool built on React Flow (`@xyflow/react`). The canvas hosts "frames" — each frame renders a self-contained HTML file via an iframe. Work is organized into **projects**; each project is a subdirectory under `PROJECTS_ROOT` with its own manifest, layout, and frames.

The intended workflow: the user describes a frame, Claude posts it to the OpenDesign HTTP API, and it appears on the canvas within ~100ms.

## Commands

- `npm run dev` — start dev server (default: http://localhost:5173)
- `npm run build` — type-check and build for production
- `npm run lint` — run ESLint
- `npx tsc -b` — type-check only
- `PROJECTS_ROOT=/path/to/root npm run dev` — point projects root at a custom location (default `./projects`)

## Architecture

**Routing**: `/` shows the project picker; `/p/:projectId` shows the canvas for a project. Defined in `src/App.tsx` with pages in `src/pages/`.

**Custom node system**: `HtmlFrameNode` is a React Flow node type (`html-frame`) that renders an iframe with a title bar (name + refresh button). Double-click enters edit mode. Defined in `src/shapes/HtmlFrameNode.tsx`, typed in `src/shapes/HtmlFrameShape.ts`.

**Two-way sync via SSE + HTTP**: `useFrameSync` (`src/hooks/useFrameSync.ts`) opens `/api/projects/:id/events` and reconciles on `manifest-changed`, `layout-changed`, and `file-changed` events. Canvas writes (drag, resize, rename, delete) go through the HTTP API (`src/lib/api.ts`). Server echoes come back as SSE and reconcile idempotently.

**On-disk layout**:
```
PROJECTS_ROOT/
  <project-id>/
    PROJECT.md             project idea + frames list
    DESIGN.md              committed aesthetic direction (drives the frontend-design skill)
    design-reference.html  auto-generated frame that renders DESIGN.md visually
    frames.json            [{ id, name, file }]
    .opendesign/layout.json    { [frameId]: { x, y, w, h } }
    <frame-id>.html
```
Content identity lives in `frames.json`; volatile canvas state (position, size) lives in the sidecar. Keeps manifest git-friendly. `PROJECT.md` and `DESIGN.md` are seeded with TODO placeholders on project creation and maintained by the `frame` skill. `design-reference.html` is seeded alongside them and registered as a frame — it fetches `DESIGN.md` at runtime, renders swatches/type specimens/etc., and auto-refreshes via SSE when DESIGN.md changes.

**Server**: a Vite plugin (`server/plugin.ts`) serves the HTTP API and streams filesystem events via chokidar. Modules:
- `server/projects.ts` — list/create/resolve projects under `PROJECTS_ROOT`
- `server/manifest.ts` — atomic read/write of `frames.json`
- `server/layout.ts` — atomic read/write of `.opendesign/layout.json`
- `server/watcher.ts` — chokidar + SSE broadcast
- `server/api.ts` — HTTP routing

## HTTP API (mounted at `/api`)

- `GET  /api/projects` / `POST /api/projects`
- `GET  /api/projects/:id/manifest`
- `GET  /api/projects/:id/layout`
- `POST /api/projects/:id/frames` (creates frame: writes HTML + manifest entry + layout seed)
- `PATCH /api/projects/:id/frames/:frameId` (rename, change file)
- `DELETE /api/projects/:id/frames/:frameId[?deleteFile=true]`
- `PATCH /api/projects/:id/layout/:frameId` (x, y, w, h)
- `GET  /api/projects/:id/events` — SSE stream

Frame HTML is served at `/frames/:projectId/:file` for iframe `src` loading.

## Skill: `/frame`

The `/frame` skill (defined in `.claude/skills/frame/SKILL.md` and `skills/frame.md`) handles creating frames. It prefers POSTing to the API when the dev server is up; falls back to direct file edits otherwise. Frame HTML files must be fully self-contained (inline CSS/JS, no external deps unless requested). It reads `PROJECT.md`/`DESIGN.md` before creating a frame and updates them after.

## Skill: `/frontend-design`

The `/frontend-design` skill (defined in `.claude/skills/frontend-design/SKILL.md` and `skills/frontend-design.md`) is the design advisor the `frame` skill delegates aesthetic decisions to. It commits a project to a bold aesthetic direction (typography, color, motion, composition, backgrounds) and can also be invoked directly when designing anything outside the frame flow.

## Skill: `/port`

The `/port` skill (defined in `.claude/skills/port/SKILL.md` and `skills/port.md`) ports an existing app's screens into a new OpenDesign project in one shot — one frame per screen. It launches an Explore subagent to identify screens and extract aesthetic signals, writes populated `PROJECT.md`/`DESIGN.md`, then spawns parallel porting subagents that POST each frame via the HTTP API. Frames are inlined snapshots meant for redesign; no round-trip back to the source app. Supports `--redesign` (commits a fresh direction via `/frontend-design`) and `--append` (extend an existing project).
