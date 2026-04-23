---
name: frame
description: Create or update an HTML frame on the OpenDesign canvas. Use when the user asks to create a screen, page, component, or frame for their app.
argument-hint: [project] [description of what the frame should show]
allowed-tools: Read Write Edit Bash(curl *) Bash(ls *) Bash(node ./node_modules/@google/design.md/*) Glob
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

Parse `$ARGUMENTS` — the first token should be the project name. If it's missing or doesn't match an existing project, ask the user which project to use (or list the options). If they want a fresh project, create it via `POST /api/projects` — see "HTTP API reference" at the end of this doc. The rest of `$ARGUMENTS` is the frame description.

Use the `path` field from the response — don't guess paths.

**If curl fails** (server not running): check `$OPENDESIGN_PROJECTS_ROOT`, or ask the user for the project directory path.

## Step 2: Read project docs

Read `<project-path>/PROJECT.md`, `<project-path>/DESIGN.md`, and `<project-path>/FEEL.md`. If any is missing (older project), create it from the template the server uses for new projects. DESIGN.md holds spec-compliant tokens + canonical prose; FEEL.md holds motion, spatial composition, and background/texture prose.

DESIGN.md and FEEL.md together drive the frame's aesthetic. Two cases:

- **Design is populated** (real tokens and prose, not `TODO`): treat it as law. Aesthetic direction, fonts, colors, motion, and composition rules are fixed for this project. Stay consistent.
- **Design is unfilled** — token maps in DESIGN.md's front-matter (`colors`, `typography`, `rounded`, `spacing`, `components`) are all empty (`{}`), and the prose sections in both DESIGN.md and FEEL.md start with `TODO:`. **HARD STOP — do not write any HTML yet.** The first frame commits the aesthetic for every future frame in this project; you don't get to pick it silently. Follow the "First-frame protocol" in Step 4 before proceeding. Write the committed choices into DESIGN.md and FEEL.md in Step 8 *before* any subsequent frames read them.

PROJECT.md gives product context (concept, naming conventions, existing frames) that shapes what the frame should be and say.

## Step 3: Check existing frames

Read `<project-path>/frames.json` to see what's already there. Use this to:
- Pick a unique `id` (lowercase kebab-case, e.g. `login-page`).
- Avoid clobbering an existing frame.

Read `<project-path>/.opendesign/layout.json` to see current positions and pick a non-overlapping spot for the new frame.

## Step 4: Write the HTML file

### First-frame protocol (run this FIRST if DESIGN.md was all `TODO` in Step 2)

The user says "wacky" / "clean" / "fun" / "modern" — that's a mood, not a direction. A dozen aesthetics fit each mood. Your job is to turn the mood into a committed direction **with the user's buy-in** before it becomes law for every future frame in this project.

1. Surface 3–4 concrete aesthetic options to the user, tailored to the frame's purpose. Not "clean vs. bold" — name specific directions, e.g. "90s web-zine / sticker-bomb", "brutalist concrete", "editorial magazine", "retro-futuristic terminal", "Memphis pastel", "Swiss grid minimalism". For each option give one sentence of concrete cues (typography feel, color attitude, motion style).
2. Ask about theme preference (light / dark / either) and any must-have references (fonts, colors, apps they like, apps they *don't* want to look like).
3. Use an interactive question tool if your harness provides one (`AskUserQuestion` in Claude Code); otherwise print a numbered list and **wait** for the reply. Do not start writing.
4. If the user says "surprise me" / "just pick", commit the direction yourself — but still summarize it back in 2–3 lines and get a go-ahead before writing.
5. Invoke the `frontend-design` skill with the user's answers. It returns three artifacts per its Output Contract: (a) YAML tokens for DESIGN.md's front-matter, (b) DESIGN.md prose blurbs, (c) FEEL.md prose.

Skipping this protocol because the user's phrasing sounds "confident enough" is how a project ends up with an aesthetic they never actually chose. Don't skip it.

### Writing the frame

Write `<project-path>/<id>.html`.

Delegate the actual design and implementation to the `frontend-design` skill — it owns aesthetic decisions (typography, color, motion, composition, backgrounds). Feed it:
- The frame's purpose (from the user's description, framed by PROJECT.md).
- The committed aesthetic from DESIGN.md.
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

Keep PROJECT.md, DESIGN.md, and FEEL.md in sync:

- **PROJECT.md** — add a line under `## Frames`: `- **<name>** — <one-sentence purpose>`. Replace the `_(none yet)_` placeholder the first time. If `## Concept` is still `TODO` and the user's intent is now clear, fill it in.
- **DESIGN.md** — edit in two places when the relevant section was still unfilled:
  1. **Front-matter** (YAML between `---` fences at the top). Replace empty maps with real tokens per the `frontend-design` Output Contract. Use the Edit tool on the literal YAML text; empty maps like `colors: {}` are unique anchors. Match 2-space indentation.
  2. **Prose sections** (Overview through Do's and Don'ts): replace each `TODO:` with a short paragraph per the Output Contract.
- **FEEL.md** — replace `TODO:` in Motion, Spatial Composition, and Backgrounds & Textures with the prose from the `frontend-design` skill's third artifact. Leave genuinely undefined sections as `TODO:`.

Leave genuinely undefined groups as empty maps and `TODO:` bodies — don't invent a design system the user hasn't asked for. Use the Edit tool. The server does not need to be notified.

## Step 9: Lint DESIGN.md (advisory)

After updating DESIGN.md, run the `@google/design.md` linter against it:

```bash
node ./node_modules/@google/design.md/dist/index.js lint <project-path>/DESIGN.md --format json
```

(Invoke via `node` directly rather than `npx` — the CLI's bin name `design.md` collides with the `.md` file extension on Windows and can misfire.)

Parse the JSON output. Surface `error`-severity findings verbatim so the user can fix them (broken token refs, etc.). Warnings and info are noise — mention only if the user asked for a strict review. **Never roll back a frame because lint complained** — lint is advisory.

FEEL.md is not linted; it's freeform prose.

## HTTP API reference

**Always prefer direct file edits** for frame content, `frames.json`, and `.opendesign/layout.json` — single frame or many, create or update or delete. The dev server watches the filesystem and reconciles on its own. The canvas sees changes within ~100ms either way, and the diff stays reviewable.

The HTTP API exists for **one thing** this skill can't do via files: creating a new project (the server has to bootstrap `PROJECT.md`, `DESIGN.md`, `design-reference.html`, and seed the manifest/layout — don't try to reproduce that by hand).

### Discover workspace

```bash
curl -s http://localhost:5173/api/workspace
# → { "root": "/abs/path", "projects": [{ "id", "path" }] }
```

### Create project

```bash
curl -s -X POST http://localhost:5173/api/projects \
  -H 'Content-Type: application/json' \
  -d '{"name":"<project-id>"}'
# 201 → { "id": "<project-id>" }
# 400 → "Invalid project name"   (your id failed the regex)
# 409 → "Project already exists"
```

**Gotcha**: the body field is called `name`, but it is validated as an **id**, not a human-readable name. It must match `^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$` — lowercase kebab-case by convention (e.g. `tinder-agents`, not `"Tinder for Agents"`). If you get "Invalid project name", your slug has spaces, uppercase, or forbidden chars.

Other endpoints exist (frame POST/PATCH/DELETE, layout PATCH, SSE events) and are documented in `server/api.ts` if you ever need them — but for this skill, file edits are the intended path.

## Updating an existing frame

Just edit `<project-path>/<id>.html` with the Edit tool. The file watcher detects the change and the canvas reloads the iframe automatically. No manifest or layout changes needed.

## Renaming a frame

Edit the `name` field of the relevant entry in `<project-path>/frames.json`. Don't change the `id` — ids are stable. Also update the name in `PROJECT.md` under `## Frames`.

## Deleting a frame

Remove the entry from `frames.json`, remove the matching key from `.opendesign/layout.json`, and (optionally) delete the HTML file. Remove the frame's bullet from `PROJECT.md` under `## Frames`. If that was the last frame, restore the `_(none yet)_` placeholder.

## Multiple frames at once

Write all HTML files first, then update `frames.json` and `.opendesign/layout.json` once with all the new entries. Update PROJECT.md's `## Frames` section once at the end with all new bullets.
