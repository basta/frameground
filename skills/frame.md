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

## Step 2: Check existing frames

Read `<project-path>/frames.json` to see what's already there. Use this to:
- Pick a unique `id` (lowercase kebab-case, e.g. `login-page`).
- Avoid clobbering an existing frame.

Read `<project-path>/.opendesign/layout.json` to see current positions and pick a non-overlapping spot for the new frame.

## Step 3: Write the HTML file

Write `<project-path>/<id>.html`. **Fully self-contained**:

- Inline all CSS in a `<style>` tag, inline all JS in a `<script>` tag.
- No external dependencies unless the user specifically asks for them.
- Modern CSS (flexbox, grid, custom properties).
- System font stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`.
- Reset: `* { margin: 0; padding: 0; box-sizing: border-box; }`.
- `<meta charset="UTF-8">` and `<meta name="viewport" ...>`.
- Render responsively — the iframe matches the layout size.
- Make interactive elements functional (buttons, inputs, toggles should work).

## Step 4: Register in `frames.json`

Read `<project-path>/frames.json`, append the new entry, and Write the file back:

```json
{
  "frames": [
    { "id": "login-page", "name": "Login page", "file": "login-page.html" }
  ]
}
```

## Step 5: Seed the layout

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

## Step 6: Confirm

Tell the user the frame was created, the name, and that they can double-click it to interact. The canvas picks up the new frame automatically within ~100ms.

## Updating an existing frame

Just edit `<project-path>/<id>.html` with the Edit tool. The file watcher detects the change and the canvas reloads the iframe automatically. No manifest or layout changes needed.

## Renaming a frame

Edit the `name` field of the relevant entry in `<project-path>/frames.json`. Don't change the `id` — ids are stable.

## Deleting a frame

Remove the entry from `frames.json`, remove the matching key from `.opendesign/layout.json`, and (optionally) delete the HTML file.

## Multiple frames at once

Write all HTML files first, then update `frames.json` and `.opendesign/layout.json` once with all the new entries.
