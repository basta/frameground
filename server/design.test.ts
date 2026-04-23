import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createProject, projectDir } from './projects.ts'
import { readProjectDesign } from './design.ts'

let tmp: string
let prevRoot: string | undefined

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opendesign-design-'))
  prevRoot = process.env.PROJECTS_ROOT
  process.env.PROJECTS_ROOT = tmp
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
  if (prevRoot === undefined) delete process.env.PROJECTS_ROOT
  else process.env.PROJECTS_ROOT = prevRoot
})

describe('readProjectDesign', () => {
  test('parses seed template: empty token maps + canonical sections + FEEL.md sections', () => {
    createProject('demo')
    const result = readProjectDesign('demo')

    expect(result.parseError).toBeUndefined()
    expect(result.design.tokens).toMatchObject({
      version: 'alpha',
      colors: {},
      typography: {},
      rounded: {},
      spacing: {},
      components: {},
    })

    const titles = result.design.sections.map(s => s.title)
    expect(titles).toEqual([
      'Overview',
      'Colors',
      'Typography',
      'Layout',
      'Elevation & Depth',
      'Shapes',
      'Components',
      "Do's and Don'ts",
    ])

    expect(result.feel).not.toBeNull()
    const feelTitles = result.feel!.sections.map(s => s.title)
    expect(feelTitles).toEqual([
      'Motion',
      'Spatial Composition',
      'Backgrounds & Textures',
    ])
  })

  test('returns null feel when FEEL.md is missing', () => {
    createProject('demo')
    fs.unlinkSync(path.join(projectDir('demo'), 'FEEL.md'))
    const result = readProjectDesign('demo')
    expect(result.feel).toBeNull()
  })

  test('captures parseError for malformed front-matter', () => {
    createProject('demo')
    const designPath = path.join(projectDir('demo'), 'DESIGN.md')
    fs.writeFileSync(designPath, '---\ncolors:\n  primary: "#unclosed\n---\n\n# Design\n')
    const result = readProjectDesign('demo')
    expect(result.parseError).toBeDefined()
  })

  test('parses populated tokens and keeps sections', () => {
    createProject('demo')
    const designPath = path.join(projectDir('demo'), 'DESIGN.md')
    fs.writeFileSync(designPath, `---
version: alpha
name: "Heritage"
colors:
  primary: "#1A1C1E"
  accent: "#B8422E"
typography:
  display:
    fontFamily: "Public Sans"
    fontSize: "48px"
    fontWeight: 700
rounded: {}
spacing:
  md: "16px"
components: {}
---

# Design Language

## Overview

Architectural minimalism.

## Colors

Palette description.
`)
    const result = readProjectDesign('demo')
    expect(result.parseError).toBeUndefined()
    expect(result.design.tokens.name).toBe('Heritage')
    expect(result.design.tokens.colors).toEqual({ primary: '#1A1C1E', accent: '#B8422E' })
    expect(result.design.tokens.typography).toMatchObject({
      display: { fontFamily: 'Public Sans', fontSize: '48px', fontWeight: 700 },
    })
    expect(result.design.sections.find(s => s.title === 'Overview')?.body).toBe('Architectural minimalism.')
  })
})
