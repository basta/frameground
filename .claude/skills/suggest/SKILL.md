---
name: suggest
description: Generate AI-curated design tweak suggestions (palette / typography variants) for an OpenDesign project. Drops three named variants into the project's suggestions drawer where the user can preview and apply them with one click.
argument-hint: [project] [tweak] [optional prompt] [--source name]
allowed-tools: Read Write Edit Bash(curl *) Bash(ls *) Bash(date *) Glob
---

# Suggest design tweaks for a project

Write three coordinated, opinionated variants for one slice of an OpenDesign project's design tokens (palette or typography). Each variant lands in the project's Tokens panel under "Suggestions" as a clickable card — the user previews instantly and applies the one they like as scratch overrides.

This skill produces *suggestions*, not commits. The user decides what (if anything) to push into DESIGN.md by clicking "Commit" in the panel.

## Step 1: Parse `$ARGUMENTS`

Free-form, in order:

- `projectId` — required. First token. Must match an existing project under `PROJECTS_ROOT`.
- `tweak` — required. One of: `palette`, `typography`.
- `prompt` — optional. The remaining text (e.g. "spring meadow", "editorial serif pairing", "warmer and quieter").
- `--source <name>` — optional flag. Sets the `source` field in the suggestion JSON. Default `suggest`. The `/frame` skill passes `--source frame` so the panel can badge auto-seeded suggestions.

If `projectId` or `tweak` is missing/invalid, ask the user before doing anything else. Don't guess.

## Step 2: Verify server + locate project

```bash
curl -s http://localhost:5173/api/workspace
```

If this fails, the dev server isn't running — stop and tell the user to `npm run dev`. Use the `path` field from the response for the project's absolute directory; don't reconstruct it.

## Step 3: Read project context

Read in this order:

- `<project-path>/DESIGN.md` — current tokens (front-matter) + canonical prose
- `<project-path>/FEEL.md` — motion / spatial / texture prose
- `<project-path>/PROJECT.md` — product context, naming, what frames exist

If DESIGN.md is unfilled (token groups all `{}`, prose all `TODO:`), still proceed — variants will propose a fresh direction. Note this in each variant's `description`.

If DESIGN.md is filled, treat the existing aesthetic as the **anchor** for variants:

- **Palette**: keep the same color *role* names (e.g. `paper`, `ink`, `accent`, `muted`, `rule`) — replace the hex values, don't invent new keys. If the existing palette has `accentSoft` / `accentGlow` rgba forms, replicate that pattern.
- **Typography**: keep the same role keys (e.g. `display`, `body`, `mono`, `prompt`) and the same sub-fields each role uses (`fontFamily`, `fontSize`, `fontWeight`, `lineHeight`, `letterSpacing`). Don't drop fields the original sets.

## Step 4: Generate three named variants

Three is the count. Each variant gets:

- `name` — short, evocative (2–4 words). Not "Option 1", not "Variant A". Examples: "Soft moss", "Bookstore dusk", "Brutalist flint", "Editorial serif", "Kiosk mono".
- `description` — one sentence explaining the move and why it suits this project's prose voice.
- `tokens` — nested object using the same shape as DESIGN.md's front-matter. **Only include the keys for the relevant tweak** (palette → `colors:`, typography → `typography:`). Never include unrelated groups.

Variants must be genuinely distinct. Three flavors of "warmer cream" is not three variants — it's one direction with hesitation. Push them apart on at least one of: temperature, contrast, mood-name, font-personality.

### Palette rules

- Hex values, lowercase, 6 digits when opaque (`#fafaf9`). For translucent overlays use `rgba(...)` matching the existing pattern if any.
- Maintain readable contrast between the role intended for surface and the role intended for primary text. If you can't, pick different hexes — don't lower your standard.
- The `accent` role (or equivalent) should be the **one** saturated color in each variant unless DESIGN.md prose explicitly says otherwise.
- Don't propose pure black (`#000`) or pure white (`#fff`) for paper/ink unless the prose voice demands clinical extremity. Off-whites and inky near-blacks read as designed.

### Typography rules

- **Never** Inter, Roboto, Arial, Helvetica, system-ui, or `-apple-system`. Refusing these is the rule, not a suggestion.
- Pick distinctive fonts available on Google Fonts (so panel previews can render them) — if a font isn't on Google Fonts, you can still propose it but warn in the description.
- Honor the existing role count. If DESIGN.md has `display + body + mono + prompt`, all four go in each variant. If only `display + body`, just those.
- Pair a display face with a body face that *contrasts* (geometric grotesk + serif, slab + humanist sans, condensed display + warm body — not two sans-serifs that read identically).
- Include `fontWeight`, `lineHeight`, `letterSpacing` when the original sets them. Don't invent values for fields the original leaves blank.

## Step 5: Write the suggestion JSON

Compute a unix-millisecond timestamp:

```bash
date +%s%3N
```

Filename: `<timestamp>-<tweak>.json` (e.g. `1745520000123-palette.json`).

Path: `<project-path>/.opendesign/suggestions/<filename>`. Create the `.opendesign/suggestions/` directory if it doesn't exist (use `mkdir -p` via Bash, or write the file with Write — Node's `fs.writeFileSync` won't auto-create directories, but the Write tool may; if it errors, mkdir first).

Shape:

```json
{
  "tweak": "palette",
  "createdAt": "2026-04-24T12:34:56.789Z",
  "prompt": "spring meadow",
  "source": "suggest",
  "variants": [
    {
      "name": "Soft moss",
      "description": "Botanical greens against cream paper; cobalt swapped for a deeper sage so the accent reads as growth, not signal.",
      "tokens": {
        "colors": {
          "paper": "#f7f5ee",
          "paperDeep": "#ece8da",
          "ink": "#1d2218",
          "inkSoft": "#3c4233",
          "muted": "#8a9180",
          "rule": "#d6d3c5",
          "ruleSoft": "#e0ddd0",
          "accent": "#3a6b3f",
          "accentSoft": "rgba(58, 107, 63, 0.08)",
          "accentGlow": "rgba(58, 107, 63, 0.15)",
          "dot": "rgba(29, 34, 24, 0.08)"
        }
      }
    },
    { "name": "...", "description": "...", "tokens": { "colors": { ... } } },
    { "name": "...", "description": "...", "tokens": { "colors": { ... } } }
  ]
}
```

Omit `prompt` from the JSON if the user didn't supply one. Always include `tweak`, `createdAt`, `source`, `variants`.

The dev server's chokidar watcher detects the new file and broadcasts `suggestions-changed` over SSE; the panel auto-displays the card within ~100ms. No API call needed.

## Step 6: Report

One line back to the user:

```
Wrote 3 <tweak> variants to <project>: <name1> / <name2> / <name3>. Open the Tokens panel (T) to preview.
```

If the user invoked you from inside the canvas via `/frame`, they may already be looking at the panel — say so concisely.

## Failure handling

- Server unreachable → stop, ask user to start `npm run dev`. Don't write to disk speculatively.
- `.opendesign/` doesn't exist → create it (and `suggestions/`) before writing.
- Tweak name unknown → ask user, list valid options (`palette`, `typography`).
- Project doesn't exist → list available projects from `/api/workspace` and ask which one.

## Non-goals

- **No edits to DESIGN.md / FEEL.md.** Suggestions are scratch space. The user commits the chosen variant via the panel's Commit button, which deep-merges into DESIGN.md through the existing `PATCH /api/projects/:id/design/tokens` endpoint.
- **No subagents.** Three variants from one Claude call is enough; parallelism here would just add coordination overhead and tend to converge.
- **No lint.** No DESIGN.md edits → nothing to lint.
- **No frame creation.** That's `/frame`. This skill only writes JSON suggestions.
