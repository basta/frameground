# OpenDesign

A Figma-like canvas for HTML. Each frame is a self-contained HTML file; you drag them around, resize them, and edit them from either the canvas or your text editor — changes sync both ways.

Designed to be driven by AI coding agents: describe a screen, get a live frame on the canvas.

Built on React, [`@xyflow/react`](https://reactflow.dev), and Vite.

![OpenDesign canvas](docs/canvas.png)

## Why

Existing design tools store your work in a proprietary format. OpenDesign stores each frame as a plain HTML file on disk. That means:

- Your favorite AI coding agent can create, edit, and port frames directly — no plugin API, no headless browser.
- Frames render real code. What you see on the canvas is what ships.
- Everything is diff-able, `git`-able, and greppable.

## Quickstart

```bash
git clone https://github.com/basta/OpenDesign.git
cd OpenDesign
npm install
npm run dev
```

Open <http://localhost:5173>. Create a project, then describe a frame to your agent.

**Custom projects root:**

```bash
PROJECTS_ROOT=/path/to/your/projects npm run dev
```

Defaults to `./projects/` (gitignored).

## How it works

**Projects** are directories under `PROJECTS_ROOT`. Each project contains:

```
<project-id>/
  PROJECT.md                 project idea + frames list
  DESIGN.md                  committed aesthetic direction
  design-reference.html      auto-generated live view of DESIGN.md
  frames.json                [{ id, name, file }]
  .opendesign/layout.json    { [frameId]: { x, y, w, h } }
  <frame-id>.html            one file per frame, fully self-contained
```

**Frames** are single HTML files with inline CSS/JS — no build step, no external deps (unless you want them). The canvas renders them via iframes.

**Two-way sync**: the dev server watches the filesystem with `chokidar` and streams change events over SSE. Edits in the canvas hit the HTTP API and are echoed back as events. Edits on disk (from your editor, or from an agent writing files directly) show up on the canvas within ~100ms.

## HTTP API

Mounted at `/api` on the dev server.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/workspace` | List projects root + project paths |
| `GET` / `POST` | `/api/projects` | List / create projects |
| `GET` | `/api/projects/:id/manifest` | Read `frames.json` |
| `GET` | `/api/projects/:id/layout` | Read `.opendesign/layout.json` |
| `POST` | `/api/projects/:id/frames` | Create frame (writes HTML + manifest + layout atomically) |
| `PATCH` | `/api/projects/:id/frames/:frameId` | Rename / change file |
| `DELETE` | `/api/projects/:id/frames/:frameId[?deleteFile=true]` | Delete frame |
| `PATCH` | `/api/projects/:id/layout/:frameId` | Move / resize |
| `GET` | `/api/projects/:id/events` | SSE stream of filesystem changes |

Frame HTML is served at `/frames/:projectId/:file` for iframe loading.

## Skills for AI agents

![Invoking the /frame skill in Claude Code](docs/skill-invocation.png)

Three [Claude Code](https://claude.ai/code) skills live in `.claude/skills/` (mirrored in `skills/`):

- **`/frame`** — create or update a single frame. Reads `PROJECT.md`/`DESIGN.md`, picks a non-overlapping position, writes the HTML, and updates the manifest.
- **`/frontend-design`** — design advisor. Commits a project to a bold aesthetic direction (typography, color, motion, composition). Invoked by `/frame` for fresh projects; can also be used standalone.
- **`/port`** — port an existing codebase into an OpenDesign project, one frame per screen. Explores the source, extracts aesthetic signals, seeds `PROJECT.md`/`DESIGN.md`, then spawns parallel subagents to port each screen. Supports `--redesign` (fresh direction) and `--append` (extend existing project).

Other coding agents should work too — the skills are just markdown describing how to hit the HTTP API.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start the dev server (canvas + API + file watcher) |
| `npm run build` | Type-check and build for production |
| `npm run lint` | Run ESLint |
| `npm run test` | Run the server test suite (Vitest) |

## Project layout

```
src/              React app (canvas, pages, hooks, node types)
server/           Vite plugin: HTTP API + chokidar watcher + SSE
.claude/skills/   Claude Code skills (frame, frontend-design, port)
skills/           Mirror of the above (for discoverability)
```

## Contributing

Issues and PRs welcome. Run `npm run lint` and `npm run test` before opening a PR. CI runs the same checks on every push.

## License

MIT — see [LICENSE](LICENSE).
