---
name: port
description: Port an existing app's screens into an OpenDesign project as one frame per screen so they can be redesigned. Use when the user wants to bring an existing codebase into OpenDesign.
argument-hint: [source-path] [project-name] [--redesign] [--append]
allowed-tools: Read Write Edit Bash(curl *) Bash(ls *) Glob Agent
---

# Port an existing app into OpenDesign

Point this skill at a source directory; get back an OpenDesign project with one frame per screen. Frames are inlined HTML snapshots meant for **redesign** — no round-trip back to the source app.

You orchestrate the work. You launch subagents but do not port screens yourself.

## Step 1: Parse arguments

`$ARGUMENTS` is a free-form string. Extract, in any order:

- `sourcePath` — first non-flag token that resolves to an existing directory. Default: current working directory.
- `projectName` — the other non-flag token, if present. Default: kebab-cased basename of `sourcePath`. Must match `^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$`.
- `--redesign` flag — if present, DESIGN.md is written via the `frontend-design` skill (fresh direction) instead of extracted from the source.
- `--append` flag — if present, reuse an existing project instead of failing when it already exists.

If either `sourcePath` or `projectName` cannot be resolved unambiguously, ask the user before doing anything else.

## Step 2: Verify server & create project

```bash
curl -s http://localhost:5173/api/workspace
```

If this fails, the dev server isn't running. Stop and tell the user to `npm run dev`.

Create the project:

```bash
curl -s -X POST http://localhost:5173/api/projects \
  -H 'Content-Type: application/json' \
  -d '{"name":"<projectName>"}'
```

- `201` → continue with a fresh project (PROJECT.md, DESIGN.md, frames.json, layout.json, design-reference.html all pre-seeded with placeholders by the server).
- `409` (already exists) + `--append` passed → read the existing `frames.json` and `.opendesign/layout.json`; you'll extend them.
- `409` without `--append` → stop and tell the user to pick a different name or pass `--append`.

Note the `projects[].path` for the new project from `/api/workspace` (call it again or look it up — don't guess). Call this `$PROJECT_PATH`.

## Step 3: Explore the source (one Explore subagent)

Launch a single `Explore` agent (`subagent_type: "Explore"`, thoroughness `"medium"`). Its only job is to analyze the source and return a structured report. The main skill stays clean.

Prompt template:

```
Analyze the codebase at <sourcePath>. You are NOT writing any code.
Return a structured report for porting it into an OpenDesign canvas — one
frame per screen. Keep the whole report under 800 words.

Return these sections, in order, using these exact headings:

### concept
One sentence describing what this app is and who it's for.

### screens
A list, one screen per bullet. For each screen:
- id: kebab-case slug, ^[a-z0-9][a-z0-9-]{0,63}$ (e.g. "login-page")
- name: human-readable ("Login page")
- purpose: one sentence
- sourceFiles: 1–5 files a porting agent should read to reconstruct the screen
- route: the route/path if the app has a router, else "—"

A "screen" is a top-level route/page, or — for non-routed apps — a distinct
top-level view. Skip shared layout wrappers, shared components, admin-only
debug pages, and anything that isn't user-facing. If the app is trivial
(one screen), return one screen. If huge, cap at 12 and mention the cap.

### aesthetic
- framework: React/Vue/Svelte/Next/plain/etc.
- cssApproach: Tailwind / CSS modules / styled-components / global CSS / etc.
- fonts: actual font families used, with weights if specified. "system" if defaulted.
- colors: concrete hex/oklch/CSS-var values observed in the source (primary, bg, text, accents). Don't invent.
- typographyScale: base size + headings, if discoverable.
- motion: observed transitions/animations, or "static" if none.

Do not run the app. Do not write any files. Return only the report text.
```

Parse the report into structured data you can hand to subsequent steps.

## Step 4: Write PROJECT.md and DESIGN.md

Both files already exist (seeded with `TODO` placeholders). Overwrite them.

### PROJECT.md

```markdown
# <projectName>

<concept from Step 3>

## Concept

<concept from Step 3, expanded to 2–4 sentences if you can infer more from
the screens list. Do NOT invent product details the exploration didn't
surface.>

## Frames

- **Design reference** — live view of the project's design language (from DESIGN.md).
- **<Screen 1 name>** — <Screen 1 purpose>.
- **<Screen 2 name>** — <Screen 2 purpose>.
...
```

In `--append` mode, merge: keep existing bullets, add new-screen bullets, don't duplicate.

### DESIGN.md + FEEL.md — default (faithful) mode

Translate Step 3's `aesthetic` into committed choices. Fill both files with concrete values drawn from the source — no invention.

**DESIGN.md** (spec-compliant YAML front-matter + canonical prose):

```markdown
---
version: alpha
name: <projectName>
description: Faithful port of <sourcePath>.
colors:
  primary: "<observed hex>"
  background: "<observed hex>"
  text: "<observed hex>"
  # add observed accents; omit keys you couldn't confirm
typography:
  body:
    fontFamily: "<observed family>"
    fontSize: "<observed base size, e.g. 16px>"
    fontWeight: <observed weight>
  # add display/mono/caption if observed in the source
spacing: {}   # fill only if source has an obvious scale
rounded: {}   # fill only if observed
components: {} # fill only if reusable patterns observed
---

# Design Language

Committed aesthetic for <projectName>, extracted from <sourcePath>.

## Overview

<One short paragraph characterizing the current look: e.g. "Clean utility-first
SaaS — dense tabular layouts, neutral palette, minimal motion." Be honest:
if it looks generic, say so; the user is here to redesign it.>

## Colors

<Prose about the palette, referencing the tokens above with source cues
(e.g. "primary from Tailwind config in tailwind.config.ts").>

## Typography

- Display: <font name, weights, source file> (if observed)
- Body: <font name, weights, source file>
- Base size: <from aesthetic.typographyScale, or "TODO" if not found>

## Layout

<Spacing observations. "TODO" if unclear.>

## Elevation & Depth

<Shadow/elevation observations. "TODO" if none.>

## Shapes

<Corner radius observations. "TODO" if none.>

## Components

<List reusable component patterns seen in the source: buttons, cards, inputs,
nav. Keep names short.>

## Do's and Don'ts

TODO: capture any obvious conventions.
```

**FEEL.md** (motion, spatial composition, backgrounds — prose only):

```markdown
# Feel

## Motion

<From aesthetic.motion. If "static", write:
"TODO: source app has no animations — add motion language if redesigning.">

## Spatial Composition

<Describe observed patterns: grid density, card layouts, hero treatments.
"TODO" if unclear.>

## Backgrounds & Textures

<Solid flat / subtle gradient / none / etc. "TODO" if unclear.>
```

Any section genuinely unknown → leave as `TODO`. **Don't invent a design system the source app doesn't have.** Faithful mode's whole point is to show the user their current reality so they can intentionally leave it.

### DESIGN.md + FEEL.md — `--redesign` mode

Invoke the `frontend-design` skill to pick a bold, fresh direction for this app given its purpose (from Step 3's `concept`) and screens list. It returns three artifacts per its Output Contract. Paste (a) into DESIGN.md's front-matter (between the `---` fences), (b) over DESIGN.md's `TODO:` prose sections, and (c) over FEEL.md's `TODO:` sections. Screens in Step 5 will be ported with the original **content** (copy, structure, affordances) but re-skinned per the new DESIGN.md.

## Step 5: Port each screen (parallel subagents)

Compute a layout position per screen before launching anything. Heuristic (same as the `frame` skill):

- Read existing `$PROJECT_PATH/.opendesign/layout.json` to find the current rightmost `x + w`.
- For each new screen, offset by `(900, 0)` from the previous position. When `x > 3000`, reset `x` to `200` and add `700` to `y`.
- Size: `1280 × 800` for full-page screens. `390 × 844` if the screen's source clearly indicates mobile-only.

Then launch **N subagents in parallel** — one per screen — in a **single message with N Agent tool calls**. Use `subagent_type: "general-purpose"`.

Prompt template (one per screen):

```
You are porting a single screen from an existing app into an OpenDesign frame.

Source: <sourcePath>
Files for this screen: <screen.sourceFiles>
Screen name: <screen.name>
Screen purpose: <screen.purpose>
Route (if any): <screen.route>
Target project id: <projectName>
Target frame id: <screen.id>
Layout: x=<x> y=<y> w=<w> h=<h>

DESIGN.md (follow it exactly):
<entire contents of DESIGN.md, inlined here>

FEEL.md (follow it for motion, spatial composition, and backgrounds):
<entire contents of FEEL.md, inlined here>

The YAML front-matter at the top of DESIGN.md is authoritative for colors,
typography, spacing, rounded, and components. DESIGN.md tokens are exposed
to every frame as CSS variables: `colors.primary` → `var(--colors-primary)`,
`typography.display.fontFamily` → `var(--typography-display-font-family)`,
etc. (YAML path kebab-joined, camelCase → kebab-case per segment). Prefer
referencing `var(--...)` in your CSS over inlining literal hex/px values
so DESIGN.md edits propagate live.

Your job:
1. Read the listed source files (and anything they directly reference for this
   screen — shared layout, a stylesheet, a component).
2. Produce a single fully self-contained HTML file that visually represents
   this screen on the OpenDesign canvas:
   - Inline all CSS in a <style> block; inline any JS in <script>.
   - <meta charset="UTF-8"> and <meta name="viewport" content="width=device-width, initial-scale=1">.
   - No external asset URLs except Google Fonts (if DESIGN.md calls for them)
     and inline SVG. No build-step syntax — plain HTML/CSS/JS only.
   - Responsive; the iframe matches the layout size above.
   - Interactive elements (buttons, inputs, toggles) should visually work even
     if the underlying logic is stubbed.
   - Static content: real copy from the source — don't lorem-ipsum it.
   - MUST include the shared-tokens block in <head> (substitute the project id):

     <link rel="stylesheet" href="/frames/<projectName>/shared.css">
     <style id="od-tokens">/* tokens injected by OpenDesign canvas */</style>
     <script>
     (function(){
       window.addEventListener('message', function(e){
         if (!e.data || e.data.type !== 'od-tokens') return;
         var el = document.getElementById('od-tokens');
         if (el) el.textContent = e.data.css;
       });
       if (window.parent === window) {
         fetch('/api/projects/<projectName>/tokens.css', {cache:'no-store'})
           .then(function(r){ return r.text(); })
           .then(function(css){ var el = document.getElementById('od-tokens'); if (el) el.textContent = css; })
           .catch(function(){});
       }
     })();
     </script>
3. Apply DESIGN.md's typography, color, motion, and composition rules. If the
   source used different fonts/colors, OVERRIDE them with DESIGN.md's choices
   (this is a redesign-ready port, not a pixel-perfect clone).
4. POST the result to the OpenDesign API to register the frame atomically:

   curl -s -X POST http://localhost:5173/api/projects/<projectName>/frames \
     -H 'Content-Type: application/json' \
     --data-binary @- <<'EOF'
   {
     "id": "<screen.id>",
     "name": "<screen.name>",
     "file": "<screen.id>.html",
     "html": "<the HTML you just wrote, JSON-escaped>",
     "x": <x>, "y": <y>, "w": <w>, "h": <h>
   }
   EOF

   Use a heredoc + JSON file to avoid shell-escaping the HTML. Write the JSON
   body to a temp file, then `curl --data-binary @<tempfile>`. Delete the temp
   file after.

5. Verify the response was 201. If it wasn't, report the error body.

Return a one-line status: "OK <screen.id>" or "FAIL <screen.id>: <reason>".
Do NOT return the HTML — it's already on the server.
```

## Step 6: Report

Collect the subagent results. Tell the user:

- Project URL: `http://localhost:5173/p/<projectName>`
- N screens ported successfully (list names)
- Any failures with their reasons

Canvas picks up each POSTed frame within ~100ms via SSE; no refresh needed.

## Failure handling

- One subagent fails → the rest still finish. Report only the failing screens; do not roll back successful ports.
- Server down mid-run → stop, report which screens completed (check `frames.json`), tell the user to restart the server and re-run with `--append` to finish the rest.
- `--append` and a screen id collides with an existing frame → skip that screen, report it as `SKIP <id> (already exists)`. Don't invent a new id — it likely means the port already happened.

## Non-goals

- No round-trip: edits made in OpenDesign don't flow back to the source app.
- No JS behavior preservation: ported frames are visual snapshots for redesign, not functional clones.
- No asset copying: external images/fonts must be reachable by URL or inlined as SVG/base64; local files in the source app are not mirrored into the project directory.
