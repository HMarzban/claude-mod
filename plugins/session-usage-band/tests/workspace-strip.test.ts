// The workspace strip: the first line of the expanded view, saying where the
// session is: its project, the branch, a worktree, changes and ahead/behind.

import { test, expect } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { BARE, LIGHT } from '../hooks/palette'
import {
  GIT_CLEAN,
  GIT_MAIN_TREE,
  PROJECT,
  START,
  DARK_HOSTS,
  LIGHT_HOSTS,
  byKey,
  contrast,
  engine,
  props,
  settle,
  shown,
  svgsOf,
  walk,
  widthOf,
  type Node,
  HOUR_1,
  setup,
  mountBand,
} from './helpers'

const HOME = { ...HOUR_1, HOME: '/Users/me' }
const DIRTY = `# branch.oid 1a2b3c4d5e6f\n# branch.head main\n# branch.upstream origin/main\n# branch.ab +2 -1\n1 .M N... 100644 100644 100644 a b src/a.ts\n1 M. N... 100644 100644 100644 a b src/b.ts\n? notes.md\n`
const DETACHED = `# branch.oid 1a2b3c4d5e6f\n# branch.head (detached)\n`
const WORKTREE = '/Users/me/workspace/claude-mod/.claude/worktrees/band-strip'
const WORKTREE_DIRS = `${PROJECT}/.git/worktrees/band-strip\n${PROJECT}/.git\n${WORKTREE}\n`

const stripOf = (tree: unknown): Node | undefined => byKey(tree, 'strip', 'Box')

/** The expanded band on `surface`, after the git read has settled. Opening
 *  is the session's, so it presses only when the cards are closed. */
const expanded = async ($: Engine, surface: 'desktop' | 'terminal', cols = 120, maxRows = 40) => {
  await settle()
  const ui = await mountBand($, surface, cols, { maxRows })
  if (byKey(await ui.drawn(), 'cards', 'Box') === undefined) await ui.press({ key: 'more' })
  await settle()
  const tree = await ui.drawn()
  await ui.unmount()
  return tree
}

test('the strip opens the expanded view: the project, home as ~, its name bold, and the branch', async ($, on) => {
  setup(on, { env: HOME })
  await $.session.start({ ...START, surface: 'desktop' })
  const tree = await expanded($, 'desktop')
  const kids = ((tree as Node).children ?? []).filter(Boolean) as Node[]
  expect(kids.map(k => k.props?.key)).toEqual(['row', 'strip', 'cards', 'actions'])
  const strip = stripOf(tree)
  expect(shown(strip)).toMatch(/^~\/workspace\/claude-mod.*main.*clean$/)
  let bold: unknown
  walk(strip, n => {
    if (n.type === 'Text' && n.props?.bold) bold = shown(n)
  })
  expect(bold).toBe('claude-mod')
  expect(svgsOf(strip).map(n => n.props?.alt)).toEqual(['folder', 'branch'])
})

test('the collapsed band has no strip', async ($, on) => {
  setup(on, { env: HOME })
  await $.session.start(START)
  await settle()
  const ui = await mountBand($, 'desktop', 120)
  expect(stripOf(await ui.drawn())).toBeUndefined()
  await ui.unmount()
})

test('a dirty tree counts its changes, and ahead/behind shows only what differs', async ($, on) => {
  setup(on, { env: HOME })
  engine.git = { status: DIRTY, dirs: GIT_MAIN_TREE }
  await $.session.start({ ...START, surface: 'desktop' })
  const tree = stripOf(await expanded($, 'desktop'))
  const strip = shown(tree)
  expect(strip).toMatch(/3 changed/)
  expect(strip).not.toMatch(/clean/)
  // on the desktop the arrows are icons a reader names: "ahead 2", "behind 1"
  const piece = (key: string) => byKey(tree, key)
  expect(svgsOf(piece('ws:ahead')).map(n => n.props?.alt)).toEqual(['ahead'])
  expect(shown(piece('ws:ahead'))).toBe('2')
  expect(svgsOf(piece('ws:behind')).map(n => n.props?.alt)).toEqual(['behind'])
  expect(shown(piece('ws:behind'))).toBe('1')
})

test('a detached HEAD says so, with its short commit', async ($, on) => {
  setup(on, { env: HOME })
  engine.git = { status: DETACHED, dirs: GIT_MAIN_TREE }
  await $.session.start({ ...START, surface: 'desktop' })
  const strip = stripOf(await expanded($, 'desktop'))
  expect(shown(strip)).toMatch(/detached at 1a2b3c4/)
  expect(svgsOf(strip).map(n => n.props?.alt)).toContain('HEAD')
})

test('a linked worktree names the repository it belongs to', async ($, on) => {
  setup(on, { env: HOME })
  engine.root = WORKTREE
  engine.git = { status: GIT_CLEAN, dirs: WORKTREE_DIRS }
  await $.session.start({ ...START, surface: 'desktop' })
  const strip = stripOf(await expanded($, 'desktop', 160))
  expect(shown(strip)).toMatch(/band-strip.*main.*worktree of claude-mod/)
  expect(svgsOf(strip).map(n => n.props?.alt)).toContain('linked')
})

test('outside a repository, or with git unable to run, the strip is the path alone', async ($, on) => {
  setup(on, { env: HOME })
  for (const git of ['none', 'fail'] as const) {
    engine.git = git
    await $.session.start({ ...START, surface: 'desktop' })
    const strip = stripOf(await expanded($, 'desktop'))
    expect(shown(strip)).toBe('~/workspace/claude-mod')
    expect(svgsOf(strip).map(n => n.props?.alt)).toEqual(['folder'])
  }
})

test('the terminal strip is words, with no icons and no bare spaces', async ($, on) => {
  setup(on, { env: HOME })
  engine.git = { status: DIRTY, dirs: GIT_MAIN_TREE }
  await $.session.start(START)
  const strip = stripOf(await expanded($, 'terminal'))
  expect(shown(strip)).toMatch(/^~\/workspace\/claude-mod · on main.*3 changed · ↑2 ↓1$/)
  expect(svgsOf(strip)).toHaveLength(0)
})

test('on the desktop no strip child is a whitespace-only string', async ($, on) => {
  setup(on, { env: HOME })
  engine.git = { status: DIRTY, dirs: GIT_MAIN_TREE }
  await $.session.start({ ...START, surface: 'desktop' })
  const bare: string[] = []
  walk(stripOf(await expanded($, 'desktop')), n => {
    for (const k of n.children ?? []) if (typeof k === 'string' && k.trim() === '') bare.push(String(n.props?.key))
  })
  expect(bare).toEqual([])
})

for (const cols of [50, 70]) {
  test(`at ${cols} columns the strip fits one line and keeps the project and the branch`, async ($, on) => {
    setup(on, { env: HOME })
    engine.root = WORKTREE
    engine.git = { status: DIRTY.replace('branch.head main', 'branch.head claude/a-rather-long-feature-branch'), dirs: WORKTREE_DIRS }
    await $.session.start(START)
    const strip = stripOf(await expanded($, 'terminal', cols))
    expect(widthOf(strip)).toBeLessThanOrEqual(cols)
    expect(shown(strip)).toMatch(/band-strip/)
    expect(shown(strip)).toMatch(/on claude/) // the branch keeps its prefix
  })
}

test('a band too short for a strip row puts it in the footer, in place of the hint', async ($, on) => {
  setup(on, { env: HOME })
  await $.session.start({ ...START, surface: 'desktop' })
  const footerOf = (tree: unknown): Node | undefined => byKey(tree, 'actions', 'Box')
  // 13 rows, as the desktop gives: each card keeps one fact, so no row is spare
  const short = await expanded($, 'desktop', 95, 13)
  const footer = footerOf(short)
  expect(stripOf(footer)).toBeDefined()
  expect(shown(stripOf(footer))).toMatch(/claude-mod.*main/)
  expect(shown(footer)).not.toMatch(/Bring it back/)
  // the footer strip leaves the buttons their room
  expect(widthOf(stripOf(footer))).toBeLessThanOrEqual(95 - 30)
  // with rows to spare it heads the view, and the hint is back
  const tall = await expanded($, 'desktop', 95, 40)
  expect(stripOf(footerOf(tall))).toBeUndefined()
  expect(stripOf(tall)).toBeDefined()
  expect(shown(footerOf(tall))).toMatch(/Bring it back/)
})

test("the strip has no ground of its own, so its text takes the host theme's colours", async ($, on) => {
  setup(on, { env: HOME })
  engine.git = { status: DIRTY, dirs: GIT_MAIN_TREE }
  await $.session.start({ ...START, surface: 'desktop' })
  const colors: string[] = []
  const visit = (n: Node | undefined): void => {
    if (n === undefined || n === null || typeof n !== 'object' || n.props?.position === 'absolute') return
    if (n.type === 'Text' && typeof n.props?.color === 'string') colors.push(n.props.color)
    for (const k of (n.children ?? []) as Node[]) visit(k)
  }
  visit(stripOf(await expanded($, 'desktop')))
  // hover cards paint their own ground; everything on the bare line is a theme key
  expect(colors.filter(c => c.startsWith('#'))).toEqual([])
})

test('its icons, which need hex, hold 3:1 on dark and light grounds alike', () => {
  for (const ground of [...DARK_HOSTS, ...LIGHT_HOSTS, '#ededf2']) {
    expect(contrast(BARE.icon, ground)).toBeGreaterThanOrEqual(3)
    expect(contrast(BARE.branch, ground)).toBeGreaterThanOrEqual(3)
  }
})

test('the light palette label holds 4.5:1 on every light surface', () => {
  for (const ground of [...LIGHT_HOSTS, LIGHT.surface, LIGHT.cardBg]) expect(contrast(LIGHT.label, ground)).toBeGreaterThanOrEqual(4.5)
})

test('a folder name too long for the line shortens, and the strip stays one row', async ($, on) => {
  setup(on, { env: HOME })
  engine.root = '/Users/me/workspace/an-unusually-long-project-folder-name-here'
  engine.repoRoot = engine.root
  engine.git = { status: DIRTY, dirs: GIT_MAIN_TREE }
  await $.session.start(START)
  for (const surface of ['terminal', 'desktop'] as const) {
    const strip = stripOf(await expanded($, surface, 40))
    if (surface === 'terminal') expect(widthOf(strip)).toBeLessThanOrEqual(40)
    expect(strip?.props?.height).toBe(1)
    expect(shown(strip)).toMatch(/an-unu.*…/)
  }
})

test('a narrow strip never hides uncommitted changes', async ($, on) => {
  setup(on, { env: HOME })
  engine.root = WORKTREE
  engine.git = { status: DIRTY.replace('branch.head main', 'branch.head claude/a-rather-long-feature-branch'), dirs: WORKTREE_DIRS }
  await $.session.start(START)
  expect(shown(stripOf(await expanded($, 'terminal', 40)))).toMatch(/±3/)
})

test('a clipped branch or path keeps its whole name for a reader', async ($, on) => {
  setup(on, { env: HOME })
  const long = 'claude/a-rather-long-feature-branch'
  engine.root = WORKTREE
  engine.git = { status: DIRTY.replace('branch.head main', `branch.head ${long}`), dirs: WORKTREE_DIRS }
  await $.session.start({ ...START, surface: 'desktop' })
  const alts = svgsOf(stripOf(await expanded($, 'desktop', 60))).map(n => String(n.props?.alt))
  expect(alts).toContain(`branch ${long}`)
  expect(alts).toContain('folder ~/workspace/claude-mod/.claude/worktrees/band-strip')
})

test("the path's hover card says the whole state, so nothing a narrow line drops is lost", async ($, on) => {
  setup(on, { env: HOME })
  engine.git = { status: DIRTY, dirs: GIT_MAIN_TREE }
  await $.session.start({ ...START, surface: 'desktop' })
  let card = ''
  walk(byKey(stripOf(await expanded($, 'desktop')), 'ws:path'), k => {
    if (k.type === 'Box' && k.props?.position === 'absolute') card = String((k.children as Node[] | undefined)?.map(c => shown(c)).join(''))
  })
  expect(card).toBe('~/workspace/claude-mod: branch main, 3 changed, 2 ahead, 1 behind')
})

test('one commit to push reads as one', async ($, on) => {
  setup(on, { env: HOME })
  engine.git = { status: DIRTY.replace('+2 -1', '+1 -0'), dirs: GIT_MAIN_TREE }
  await $.session.start({ ...START, surface: 'desktop' })
  const text: string[] = []
  walk(stripOf(await expanded($, 'desktop')), n => {
    if (n.type === 'Box' && n.props?.position === 'absolute') text.push(shown({ ...n, props: {} }))
  })
  expect(text).toContain('1 commit to push')
  expect(text.join('|')).not.toMatch(/0 to pull/)
})
