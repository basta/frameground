---
name: frame
description: Create or update an HTML frame on the OpenDesign canvas. Use when the user asks to create a screen, page, component, or frame for their app.
argument-hint: [project] [description of what the frame should show]
allowed-tools: Read Write Edit Bash(curl *) Bash(ls *) Glob
---

# Create or update an OpenDesign Frame

OpenDesign organizes work into **projects**. Each project lives in its own directory and contains:

```
<project-dir>/
  PROJECT.md               project idea + frames list
  DESIGN.md                committed aesthetic direction (see frontend-design skill)
  frames.json              [{ id, name, file }]
  .opendesign/layout.json  { [frameId]: { x, y, w, h } }
  <frame-id>.html          one file per frame, fully self-contained
```

You edit these files directly with Read/Write/Edit. The OpenDesign dev server watches the filesystem and pushes changes to the canvas over SSE — no API calls needed for frame content.

## Step 1: Find the project

Ask the dev server where projects live:

```bash
curl -s http://localhost:5173/api/workspace
```

Response:
```json
{
  "root": "/absolute/path/to/projects",
  "projects": [
    { "id": "demo", "path": "/absolute/path/to/projects/demo" }
  ]
}
```

Parse `$ARGUMENTS` — the first token should be the project name. If it's missing or doesn't match an existing project, ask the user which project to use (or list the options). The rest of `$ARGUMENTS` is the frame description.

Use the `path` field from the response — don't guess paths.

**If curl fails** (server not running): check `$OPENDESIGN_PROJECTS_ROOT`, or ask the user for the project directory path.

## Step 2: Read project docs

Read `<project-path>/PROJECT.md` and `<project-path>/DESIGN.md`. If either is missing (older project), create it from the template the server uses for new projects.

DESIGN.md drives the frame's aesthetic. Two cases:

- **DESIGN.md is populated** (real values, not `TODO`): treat it as law. Aesthetic direction, fonts, colors, motion, and composition rules are fixed for this project. Stay consistent.
- **DESIGN.md is still all `TODO`** (this is the first frame, or no one has committed yet): invoke the `frontend-design` skill to make the hard choices — aesthetic direction, distinctive font pair, dominant-plus-accent palette, motion language, composition rules, background/texture treatment. Write those choices into DESIGN.md in Step 8 *before* any subsequent frames read it.

PROJECT.md gives product context (concept, naming conventions, existing frames) that shapes what the frame should be and say.

## Step 3: Check existing frames

Read `<project-path>/frames.json` to see what's already there. Use this to:
- Pick a unique `id` (lowercase kebab-case, e.g. `login-page`).
- Avoid clobbering an existing frame.

Read `<project-path>/.opendesign/layout.json` to see current positions and pick a non-overlapping spot for the new frame.

## Step 4: Write the HTML file

Write `<project-path>/<id>.html`.

Delegate the actual design and implementation to the `frontend-design` skill — it owns aesthetic decisions (typography, color, motion, composition, backgrounds). Feed it:
- The frame's purpose (from the user's description, framed by PROJECT.md).
- The committed aesthetic from DESIGN.md (or, if first frame, the direction you're about to commit).
- The hard constraints below.

Hard constraints (these override stylistic preferences):
- Fully self-contained: inline CSS in `<style>`, inline JS in `<script>`.
- No external deps unless the user explicitly asks.
- `<meta charset="UTF-8">` and `<meta name="viewport" ...>`.
- Render responsively — the iframe matches the layout size.
- Interactive elements must actually work (buttons, inputs, toggles).

Do NOT fall back to the generic system font stack or Inter/Arial/Roboto. Pick distinctive fonts per the `frontend-design` skill.

## Step 5: Register in `frames.json`

Read `<project-path>/frames.json`, append the new entry, and Write the file back:

```json
{
  "frames": [
    { "id": "login-page", "name": "Login page", "file": "login-page.html" }
  ]
}
```

## Step 6: Seed the layout

Read `<project-path>/.opendesign/layout.json` (create the `.opendesign/` directory if it doesn't exist). Add an entry for the new frame and Write it back:

```json
{
  "login-page": { "x": 200, "y": 200, "w": 800, "h": 600 }
}
```

Position heuristic: offset each new frame by `(900, 0)` from the rightmost existing frame. When `x > 3000`, reset `x` to `200` and add `700` to `y`. Start at `(200, 200)` if the project is empty.

Size by kind:
- Full page/screen: `1280 x 800`
- Mobile screen: `390 x 844`
- Small component/card: `400 x 300`
- Dialog/modal: `500 x 400`
- Default: `800 x 600`

## Step 7: Confirm

Tell the user the frame was created, the name, and that they can double-click it to interact. The canvas picks up the new frame automatically within ~100ms.

## Step 8: Update project docs

Keep PROJECT.md and DESIGN.md in sync:

- **PROJECT.md** — add a line under `## Frames`: `- **<name>** — <one-sentence purpose>`. Replace the `_(none yet)_` placeholder the first time. If `## Concept` is still `TODO` and the user's intent is now clear, fill it in.
- **DESIGN.md** — if this was the first frame (or the relevant section was still `TODO`), write the committed choices in. Be specific: font names with weights, hex colors, spacing scale, motion timings. If you introduced a new reusable component, document it under `## Components`. Leave genuinely-undefined sections as `TODO` — don't invent a design system the user hasn't asked for.

Both are plain markdown. Use the Edit tool. The server does not need to be notified.

## Updating an existing frame

Just edit `<project-path>/<id>.html` with the Edit tool. The file watcher detects the change and the canvas reloads the iframe automatically. No manifest or layout changes needed.

## Renaming a frame

Edit the `name` field of the relevant entry in `<project-path>/frames.json`. Don't change the `id` — ids are stable. Also update the name in `PROJECT.md` under `## Frames`.

## Deleting a frame

Remove the entry from `frames.json`, remove the matching key from `.opendesign/layout.json`, and (optionally) delete the HTML file. Remove the frame's bullet from `PROJECT.md` under `## Frames`. If that was the last frame, restore the `_(none yet)_` placeholder.

## Multiple frames at once

Write all HTML files first, then update `frames.json` and `.opendesign/layout.json` once with all the new entries. Update PROJECT.md's `## Frames` section once at the end with all new bullets.
