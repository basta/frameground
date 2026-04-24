---
name: alternatives
description: Generate N alternative designs of a frame so the user can compare them side by side on the canvas. Use when the user wants options for a screen before committing.
argument-hint: [project] [existing-frame-id | fresh description] [--wild] [--count N]
allowed-tools: Read Write Edit Bash(curl *) Bash(ls *) Glob Agent
---

# Generate alternative designs for a frame

Spin up N parallel takes on a single frame — side by side on the OpenDesign canvas — so the user can eyeball which one wins. Two flavors of comparison:

- **Execution shopping** — DESIGN.md is filled; all alternatives respect the committed aesthetic but vary in layout, composition, and copy hierarchy.
- **Direction shopping** — DESIGN.md is empty *or* the user passed `--wild`; each alternative commits to a *different* aesthetic direction.

You orchestrate and gate; subagents write the HTML. Nothing is committed to DESIGN.md, FEEL.md, or PROJECT.md — these are exploratory frames.

## Step 1: Parse arguments

`$ARGUMENTS` is free-form. Extract:

- `projectId` — required. Must match an existing project from `/api/workspace`.
- `riffFrameId` — optional. If any token matches an existing frame id in that project's `frames.json`, enter **riff mode**; the rest of the text is steering ("a different take", "more dramatic"), may be empty.
- `description` — remaining free-form text (fresh mode only).
- `--wild` flag — forces direction-shopping.
- `--count N` — default 3; clamped to `[2, 5]`.

If `projectId` is missing or ambiguous, ask the user before doing anything else.

## Step 2: Verify server

```bash
curl -s http://localhost:5173/api/workspace
```

If this fails, the dev server isn't running. Stop and tell the user to `npm run dev`. Note the project's `path` from the response — don't guess paths.

## Step 3: Detect mode

Read `<project-path>/DESIGN.md`. "Filled" iff at least one of the five token groups (`colors`, `typography`, `rounded`, `spacing`, `components`) in the YAML front-matter is non-empty.

- `--wild` OR empty DESIGN.md → **direction** mode.
- Else → **execution** mode.

## Step 4: Pick alt ids

- **Riff mode**: base = `riffFrameId`. Alt ids = `<base>-alt-1` … `<base>-alt-N`.
- **Fresh mode**: base = kebab-case slug of the description (e.g. "pricing page" → `pricing-page`). Alt ids same pattern.
- If any alt id collides with an existing entry in `frames.json`, bump the suffix (`-alt-4`, `-alt-5`, …) until all N are unique.

## Step 5: Compute layout positions

Read `<project-path>/.opendesign/layout.json`. Find the rightmost `x + w` across existing frames. Lay out the N alternatives in a horizontal row from there, stride `(900, 0)` per alt. Reset to `x = 200`, `y += 700` if `x > 3000`.

Size: `1280 x 800` for full-page screens; `390 x 844` if the description clearly indicates mobile-only.

## Step 6: Read input context

Always read `<project-path>/DESIGN.md`, `<project-path>/FEEL.md`, and `<project-path>/PROJECT.md`. In riff mode, also read `<project-path>/<riffFrameId>.html`.

## Step 7: Propose N distinct seed hints

Pick N distinct hints *tailored to the frame's purpose*. Don't reuse the same stock list across runs — the proposals should feel specific.

- **Direction mode** — N aesthetic direction labels, each with a one-sentence hook on typography, color attitude, and motion. Example:
  1. **Brutalist concrete** — slab serif display, raw grid, high-contrast blocks, no gradients.
  2. **Editorial magazine** — refined serif + sans pairing, generous negative space, rule-of-thirds imagery.
  3. **Retro-futuristic terminal** — monospace, scanlines, amber-on-black, CRT glow.
- **Execution mode** — N composition hints that respect DESIGN.md. Vary information density, visual hierarchy, scroll rhythm. Example for a pricing page:
  1. **Dense comparison table** — all tiers visible at once, feature rows, low scroll.
  2. **Progressive reveal** — hero CTA, recommended tier highlighted, secondary tiers below.
  3. **Story-led** — narrative scroll, testimonial anchors, pricing tier reveal at end.
- **Riff mode** — N angles on the existing frame's weaknesses (tighter density, flipped hierarchy, moodier color treatment, etc.), each one sentence.

## Step 8: Confirm with user before dispatch

Write the list in the chat. Then pause for approval.

- If your harness provides `AskUserQuestion`: ask with three choices — *Approve all*, *Swap one or more*, *Reroll* — plus the automatic "Other" free-form fallback.
- Otherwise: print the numbered list and wait for a free-form reply ("yes", "reroll", "swap #2 for something more industrial", etc.).

On *Swap* or free-form edits: apply the edits and re-present the list. On *Reroll*: generate a fresh batch (different labels, not shuffled) and re-present. **Do not launch subagents until the user explicitly approves the list.**

This gate is the primary defense against parallel subagents converging on similar output. Don't skip it.

## Step 9: Launch N parallel subagents

In a **single message**, make N `Agent` tool calls with `subagent_type: "general-purpose"`. Each gets the same template with its own assigned hint and layout slot.

Prompt template (one per alt):

```
You are producing one of N parallel design alternatives for an OpenDesign frame.
You will NOT see the other alternatives. Your job is to commit fully to the hint
assigned below and produce something distinctive.

Project path: <project-path>
Target project id: <projectId>
Alt id: <alt-id-N>
Alt name: <humanized alt id, e.g. "Pricing page — Brutalist concrete">
Layout: x=<x> y=<y> w=<w> h=<h>
Mode: <direction | execution | riff>

Your assigned hint (commit to this — do not blend it with other directions):
<the one hint from step 7 that was assigned to this slot>

Frame purpose: <description, or riffFrameId's purpose from PROJECT.md>

DESIGN.md:
<entire contents>

FEEL.md:
<entire contents>

<Only in riff mode:>
Original frame HTML (<riffFrameId>.html) — produce something different but
solving the same user problem:
<entire contents>

Rules:
- Direction mode: DESIGN.md and FEEL.md are *reference for what you are deliberately
  diverging from*. Pick fonts/colors/motion per your assigned direction; invoke the
  `frontend-design` skill internally if helpful.
- Execution mode: DESIGN.md and FEEL.md are LAW. Use their fonts, colors, radii,
  spacing. Vary layout, composition, copy emphasis per your composition hint.
- Riff mode: keep the user problem the original frame solves; change the approach
  per your assigned angle. Follow DESIGN.md/FEEL.md if filled; otherwise treat
  this like direction mode.
- Fully self-contained HTML: inline CSS in <style>, inline JS in <script>,
  <meta charset="UTF-8"> and <meta name="viewport" content="width=device-width, initial-scale=1">.
  No external deps except Google Fonts and inline SVG.
- Interactive elements (buttons, inputs, toggles) must visually work.
- Responsive; iframe matches the layout size.
- DO NOT default to Inter, Roboto, Arial, or system fonts. DO NOT default to
  purple-on-white gradients. Pick distinctive, intentional choices.
- MUST include the shared-tokens block in <head>:

  <link rel="stylesheet" href="/frames/<projectId>/shared.css">
  <style id="od-tokens">/* tokens injected by OpenDesign canvas */</style>
  <script>
  (function(){
    window.addEventListener('message', function(e){
      if (!e.data || e.data.type !== 'od-tokens') return;
      var el = document.getElementById('od-tokens');
      if (el) el.textContent = e.data.css;
    });
    if (window.parent === window) {
      fetch('/api/projects/<projectId>/tokens.css', {cache:'no-store'})
        .then(function(r){ return r.text(); })
        .then(function(css){ var el = document.getElementById('od-tokens'); if (el) el.textContent = css; })
        .catch(function(){});
    }
  })();
  </script>

  - Execution mode: reference DESIGN.md tokens as var(--colors-primary),
    var(--typography-display-font-family), etc. in your CSS — all alts share
    the same tokens, editing DESIGN.md will update all of them live.
  - Direction / --wild mode: still include the block above, then add your
    own <style> LATER in <head> that redeclares :root { --colors-primary: ...;
    --typography-display-font-family: ...; ... } with your committed aesthetic.
    Inline <style> loads after #od-tokens so your overrides win the cascade.
    This keeps alts aesthetically independent but pre-wired if the user
    commits one as the project's direction.

Register the frame atomically with the server:

  # Write the JSON body to a temp file to avoid shell-escaping the HTML.
  cat > /tmp/<alt-id>.json <<'EOF'
  {
    "id": "<alt-id>",
    "name": "<alt-name>",
    "file": "<alt-id>.html",
    "html": "<JSON-escaped HTML>",
    "x": <x>, "y": <y>, "w": <w>, "h": <h>
  }
  EOF
  curl -s -X POST http://localhost:5173/api/projects/<projectId>/frames \
    -H 'Content-Type: application/json' \
    --data-binary @/tmp/<alt-id>.json
  rm /tmp/<alt-id>.json

Verify the response was 201. Return a single line: "OK <alt-id>" or
"FAIL <alt-id>: <reason>". Do NOT return the HTML.
```

## Step 10: Report

Collect subagent results. Tell the user:

- Project URL: `http://localhost:5173/p/<projectId>` (canvas auto-refreshes via SSE; no manual reload needed).
- N alternatives created, by id and assigned hint.
- Any failures with their reasons.
- One-line reminder: nothing was committed to DESIGN.md / FEEL.md. If the user picks a winner in `--wild` or empty-DESIGN mode and wants that aesthetic to become the project's law, they should follow up with `/frame` or ask you to commit the winner's tokens.

## Failure handling

- One subagent fails → the rest still finish. Report the failure, don't roll back successes.
- Server down mid-run → stop, tell the user which alternatives completed (check `frames.json`), ask them to restart the server and re-run.
- Id collision at POST time despite the suffix-bump → report and skip that slot.

## Non-goals

- **Pick-the-winner flow.** User picks visually on the canvas; losers are deleted manually (or by asking you).
- **Committing a winner's aesthetic.** Not this skill's job — ask `/frame` or do it by hand afterward.
- **Updating PROJECT.md's Frames list.** Alternatives are throwaway by design; keeping them out of PROJECT.md avoids clutter.
- **Lint.** No DESIGN.md edits, nothing to lint.
