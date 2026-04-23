---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when the user asks to build web components, pages, or applications. Generates creative, polished code that avoids generic AI aesthetics.
allowed-tools: Read Write Edit Glob
---

This skill guides creation of distinctive, production-grade frontend interfaces that avoid generic "AI slop" aesthetics. Implement real working code with exceptional attention to aesthetic details and creative choices.

The user provides frontend requirements: a component, page, application, or interface to build. They may include context about the purpose, audience, or technical constraints.

## Design Thinking

Before coding, understand the context and commit to a BOLD aesthetic direction:
- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick an extreme: brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian, etc. There are so many flavors to choose from. Use these for inspiration but design one that is true to the aesthetic direction.
- **Constraints**: Technical requirements (framework, performance, accessibility).
- **Differentiation**: What makes this UNFORGETTABLE? What's the one thing someone will remember?

**CRITICAL**: Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work - the key is intentionality, not intensity.

Then implement working code (HTML/CSS/JS, React, Vue, etc.) that is:
- Production-grade and functional
- Visually striking and memorable
- Cohesive with a clear aesthetic point-of-view
- Meticulously refined in every detail

## Frontend Aesthetics Guidelines

Focus on:
- **Typography**: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics; unexpected, characterful font choices. Pair a distinctive display font with a refined body font.
- **Color & Theme**: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes.
- **Motion**: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions. Use scroll-triggering and hover states that surprise.
- **Spatial Composition**: Unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements. Generous negative space OR controlled density.
- **Backgrounds & Visual Details**: Create atmosphere and depth rather than defaulting to solid colors. Add contextual effects and textures that match the overall aesthetic. Apply creative forms like gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows, decorative borders, custom cursors, and grain overlays.

NEVER use generic AI-generated aesthetics like overused font families (Inter, Roboto, Arial, system fonts), cliched color schemes (particularly purple gradients on white backgrounds), predictable layouts and component patterns, and cookie-cutter design that lacks context-specific character.

Interpret creatively and make unexpected choices that feel genuinely designed for the context. No design should be the same. Vary between light and dark themes, different fonts, different aesthetics. NEVER converge on common choices (Space Grotesk, for example) across generations.

**IMPORTANT**: Match implementation complexity to the aesthetic vision. Maximalist designs need elaborate code with extensive animations and effects. Minimalist or refined designs need restraint, precision, and careful attention to spacing, typography, and subtle details. Elegance comes from executing the vision well.

Remember: Claude is capable of extraordinary creative work. Don't hold back, show what can truly be created when thinking outside the box and committing fully to a distinctive vision.

## Output contract when called from the `frame` or `port` skill

When invoked to seed or update an OpenDesign project's design files, return three artifacts the caller pastes in:

**1. YAML front-matter for DESIGN.md** (goes between the `---` fences at the top). Fill all five token groups when possible. Follow Google's `design.md` spec — this shape is authoritative and gets linted.

```yaml
version: alpha
name: <project name>
description: <one line describing the committed aesthetic>
colors:
  primary: "#..."
  surface: "#..."
  text: "#..."
  # accent(s), muted — whatever the aesthetic calls for
typography:
  display:
    fontFamily: "<distinctive display font — NOT Inter/Roboto/Arial>"
    fontSize: "<e.g. 56px>"
    fontWeight: <number>
    lineHeight: "<optional>"
    letterSpacing: "<optional>"
  body:
    fontFamily: "<refined body font>"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "1.5"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "32px"
  xl: "64px"
rounded:
  none: "0"
  sm: "4px"
  md: "8px"
  full: "9999px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
```

Use `{colors.<name>}` / `{typography.<name>}` / `{rounded.<name>}` refs inside `components`; don't re-specify hex values there.

**2. Markdown prose blurbs for DESIGN.md** — one short paragraph per section, in this canonical order:

- `## Overview` — commit the tone in 1–2 sentences.
- `## Colors` — *why* this palette.
- `## Typography` — the pairing's voice.
- `## Layout` — spacing rhythm rationale.
- `## Elevation & Depth` — how depth is expressed.
- `## Shapes` — corner rationale.
- `## Components` — component voice/treatment.
- `## Do's and Don'ts` — bullets starting with `DO` or `DON'T`.

**3. Markdown prose for FEEL.md** — a separate file capturing the project's non-token dimensions:

- `## Motion` — choreography, timings, easings.
- `## Spatial Composition` — grid/asymmetry/density/flow.
- `## Backgrounds & Textures` — atmospheric treatment.

Return all three artifacts in one response. The caller handles pasting.
