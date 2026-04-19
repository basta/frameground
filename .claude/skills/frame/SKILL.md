---
name: frame
description: Create or update an HTML frame on the OpenDesign tldraw canvas. Use when the user asks to create a screen, page, component, or frame for their app.
argument-hint: [description of what the frame should show]
allowed-tools: Read Write Edit Bash(cat *) Glob
---

# Create an OpenDesign Frame

You are adding a frame to an OpenDesign canvas — a tldraw-based design tool where each frame is a self-contained HTML file rendered in an iframe.

## What to do

Given the user's description in `$ARGUMENTS`, create a new frame:

### Step 1: Read the current manifest

Read `frames.json` in the project directory (the directory passed as `FRAMES_DIR` to OpenDesign, which is the current working directory) to see existing frames and determine:
- A unique `id` (lowercase kebab-case, e.g. `login-page`)
- The next available position — offset each new frame by `(900, 0)` from the last frame's `x` position, wrapping to a new row at `x > 3000` by resetting `x` to `200` and adding `700` to `y`

### Step 2: Write the HTML file

Write a self-contained HTML file to `<id>.html` in the project directory.

Rules for the HTML file:
- **Fully self-contained** — inline all CSS in a `<style>` tag, inline all JS in a `<script>` tag
- **No external dependencies** unless the user specifically asks for them (e.g. a CDN library)
- Use modern CSS (flexbox, grid, custom properties, etc.)
- Use the system font stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
- Include `* { margin: 0; padding: 0; box-sizing: border-box; }` reset
- The frame renders inside an iframe at whatever `w`/`h` the manifest specifies, so design responsively
- Make it look polished — use proper spacing, colors, typography
- Make interactive elements functional (buttons, inputs, toggles should work)
- Include `<meta charset="UTF-8">` and `<meta name="viewport" ...>`

### Step 3: Update the manifest

Read `frames.json` in the project directory, append the new entry to the `frames` array, and write it back. Entry format:

```json
{
  "id": "my-frame",
  "name": "My Frame",
  "file": "my-frame.html",
  "x": 200,
  "y": 200,
  "w": 800,
  "h": 600
}
```

Choose `w` and `h` based on what makes sense:
- Full page/screen: `1280 x 800`
- Mobile screen: `390 x 844`
- Small component/card: `400 x 300`
- Dialog/modal: `500 x 400`
- Default: `800 x 600`

### Step 4: Confirm

Tell the user the frame was created and will appear on the canvas within a few seconds. Mention the frame name and that they can double-click it to interact with it.

## Updating an existing frame

If the user asks to modify an existing frame, read the current HTML file, make the changes, and write it back. Tell them to click the ↻ refresh button on the frame's title bar to see changes.

## Multiple frames

If the user asks for multiple frames at once (e.g. "create the login, signup, and dashboard pages"), create all the HTML files first, then update `frames.json` once with all new entries.
