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
    DESIGN.md              spec-compliant design tokens + canonical prose (Google design.md spec)
    FEEL.md                project-specific prose for motion, spatial composition, backgrounds
    design-reference.html  auto-generated frame that renders DESIGN.md + FEEL.md visually
    frames.json            [{ id, name, file }]
    .opendesign/layout.json    { [frameId]: { x, y, w, h } }
    <frame-id>.html
```
Content identity lives in `frames.json`; volatile canvas state (position, size) lives in the sidecar. Keeps manifest git-friendly. `PROJECT.md`, `DESIGN.md`, and `FEEL.md` are seeded with TODO placeholders on project creation and maintained by the `frame` skill. `DESIGN.md` follows Google's [`design.md`](https://github.com/google-labs-code/design.md) spec — YAML front-matter tokens (colors, typography, rounded, spacing, components) plus canonical prose sections. `FEEL.md` holds the non-token creative dimensions the spec doesn't cover. `design-reference.html` fetches structured design data from `/api/projects/:id/design` and auto-refreshes via SSE when either file changes.

**Server**: a Vite plugin (`server/plugin.ts`) serves the HTTP API and streams filesystem events via chokidar. Modules:
- `server/projects.ts` — list/create/resolve projects under `PROJECTS_ROOT`
- `server/manifest.ts` — atomic read/write of `frames.json`
- `server/layout.ts` — atomic read/write of `.opendesign/layout.json`
- `server/design.ts` — parse `DESIGN.md` front-matter + read `FEEL.md`
- `server/watcher.ts` — chokidar + SSE broadcast
- `server/api.ts` — HTTP routing

## HTTP API (mounted at `/api`)

- `GET  /api/projects` / `POST /api/projects`
- `GET  /api/projects/:id/manifest`
- `GET  /api/projects/:id/layout`
- `GET  /api/projects/:id/design` (parsed DESIGN.md tokens + sections, plus FEEL.md)
- `POST /api/projects/:id/frames` (creates frame: writes HTML + manifest entry + layout seed)
- `PATCH /api/projects/:id/frames/:frameId` (rename, change file)
- `DELETE /api/projects/:id/frames/:frameId[?deleteFile=true]`
- `PATCH /api/projects/:id/layout/:frameId` (x, y, w, h)
- `GET  /api/projects/:id/events` — SSE stream

Frame HTML is served at `/frames/:projectId/:file` for iframe `src` loading.

## Skill: `/frame`

The `/frame` skill (defined in `.claude/skills/frame/SKILL.md` and `skills/frame.md`) handles creating frames. It prefers to edit the .html/.json/.md files directly, can use API as fallback.; falls back to direct file edits otherwise. Frame HTML files must be fully self-contained (inline CSS/JS, no external deps unless requested). It reads `PROJECT.md`, `DESIGN.md`, and `FEEL.md` before creating a frame, updates them after, and runs an advisory lint (`@google/design.md lint`) against DESIGN.md.

## Skill: `/frontend-design`

The `/frontend-design` skill (defined in `.claude/skills/frontend-design/SKILL.md` and `skills/frontend-design.md`) is the design advisor the `frame` skill delegates aesthetic decisions to. It commits a project to a bold aesthetic direction (typography, color, motion, composition, backgrounds) and can also be invoked directly when designing anything outside the frame flow.

## Skill: `/port`

The `/port` skill (defined in `.claude/skills/port/SKILL.md` and `skills/port.md`) ports an existing app's screens into a new OpenDesign project in one shot — one frame per screen. It launches an Explore subagent to identify screens and extract aesthetic signals, writes populated `PROJECT.md` / `DESIGN.md` / `FEEL.md`, then spawns parallel porting subagents that POST each frame via the HTTP API. Frames are inlined snapshots meant for redesign; no round-trip back to the source app. Supports `--redesign` (commits a fresh direction via `/frontend-design`) and `--append` (extend an existing project).

## Skill: `/alternatives`

The `/alternatives` skill (defined in `.claude/skills/alternatives/SKILL.md` and `skills/alternatives.md`) produces N parallel takes on a single frame so the user can compare side by side on the canvas. Auto-picks mode from DESIGN.md state — *execution*-shopping (layout/composition variants within the committed aesthetic) when filled, *direction*-shopping (each alt commits its own aesthetic) when empty. `--wild` forces direction-shopping regardless. Riffs on an existing frame when the user names its id; otherwise fresh. Gates on user approval of the proposed directions before dispatching parallel subagents, to avoid convergence. Exploratory by design — does not commit to DESIGN.md / FEEL.md / PROJECT.md and skips lint.
