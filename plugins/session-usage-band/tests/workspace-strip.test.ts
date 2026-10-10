// The workspace strip: the first line of the expanded view, saying where the
// session is: its project, the branch, a worktree, changes and ahead/behind.

import { test, expect } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'
import { ROW_SLACK } from '../hooks/layout'
import { BARE, LIGHT } from '../hooks/palette'
import {
  GIT_CLEAN,
  GIT_MAIN_TREE,
  PROJECT,
  START,
  DARK_HOSTS,
  LIGHT_HOSTS,
  byKey,
  cards,
  contrast,
  engine,
  hoverCardOf,
  isCard,
  props,
  shown,
  svgsOf,
  textOf,
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
const expanded = async ($: Engine, clock: MockClock, surface: 'desktop' | 'terminal', cols = 120, maxRows = 40) => {
  await clock.settle()
  const ui = await mountBand($, surface, cols, { maxRows })
  if (byKey(await ui.drawn(), 'cards', 'Box') === undefined) await ui.press({ key: 'more' })
  await clock.settle()
  const tree = await ui.drawn()
  await ui.unmount()
  return tree
}

test('the strip opens the expanded view: the project, home as ~, its name bold, and the branch', async ($, on) => {
  const clock = setup(on, { env: HOME })
  await $.session.start({ ...START, surface: 'desktop' })
  const tree = await expanded($, clock, 'desktop')
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
  const clock = setup(on, { env: HOME })
  await $.session.start(START)
  await clock.settle()
  const ui = await mountBand($, 'desktop', 120)
  expect(stripOf(await ui.drawn())).toBeUndefined()
  await ui.unmount()
})

test('a dirty tree counts its changes, and ahead/behind shows only what differs', async ($, on) => {
  const clock = setup(on, { env: HOME })
  engine.git = { status: DIRTY, dirs: GIT_MAIN_TREE }
  await $.session.start({ ...START, surface: 'desktop' })
  const tree = stripOf(await expanded($, clock, 'desktop'))
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
  const clock = setup(on, { env: HOME })
  engine.git = { status: DETACHED, dirs: GIT_MAIN_TREE }
  await $.session.start({ ...START, surface: 'desktop' })
  const strip = stripOf(await expanded($, clock, 'desktop'))
  expect(shown(strip)).toMatch(/detached at 1a2b3c4/)
  expect(svgsOf(strip).map(n => n.props?.alt)).toContain('HEAD')
})

test('a linked worktree names the repository it belongs to', async ($, on) => {
  const clock = setup(on, { env: HOME })
  engine.root = WORKTREE
  engine.git = { status: GIT_CLEAN, dirs: WORKTREE_DIRS }
  await $.session.start({ ...START, surface: 'desktop' })
  const strip = stripOf(await expanded($, clock, 'desktop', 160))
  expect(shown(strip)).toMatch(/band-strip.*main.*worktree of claude-mod/)
  expect(svgsOf(strip).map(n => n.props?.alt)).toContain('linked')
})

test('outside a repository, or with git unable to run, the strip is the path alone', async ($, on) => {
  const clock = setup(on, { env: HOME })
  for (const git of ['none', 'fail'] as const) {
    engine.git = git
    await $.session.start({ ...START, surface: 'desktop' })
    const strip = stripOf(await expanded($, clock, 'desktop'))
    expect(shown(strip)).toBe('~/workspace/claude-mod')
    expect(svgsOf(strip).map(n => n.props?.alt)).toEqual(['folder'])
  }
})

test('the terminal strip is words, with no icons and no bare spaces', async ($, on) => {
  const clock = setup(on, { env: HOME })
  engine.git = { status: DIRTY, dirs: GIT_MAIN_TREE }
  await $.session.start(START)
  const strip = stripOf(await expanded($, clock, 'terminal'))
  expect(shown(strip)).toMatch(/^~\/workspace\/claude-mod · on main.*3 changed · ↑2 ↓1$/)
  expect(svgsOf(strip)).toHaveLength(0)
})

test('on the desktop no strip child is a whitespace-only string', async ($, on) => {
  const clock = setup(on, { env: HOME })
  engine.git = { status: DIRTY, dirs: GIT_MAIN_TREE }
  await $.session.start({ ...START, surface: 'desktop' })
  const bare: string[] = []
  walk(stripOf(await expanded($, clock, 'desktop')), n => {
    for (const k of n.children ?? []) if (typeof k === 'string' && k.trim() === '') bare.push(String(n.props?.key))
  })
  expect(bare).toEqual([])
})

for (const cols of [50, 70]) {
  test(`at ${cols} columns the strip fits one line and keeps the project and the branch`, async ($, on) => {
    const clock = setup(on, { env: HOME })
    engine.root = WORKTREE
    engine.git = { status: DIRTY.replace('branch.head main', 'branch.head claude/a-rather-long-feature-branch'), dirs: WORKTREE_DIRS }
    await $.session.start(START)
    const strip = stripOf(await expanded($, clock, 'terminal', cols))
    expect(widthOf(strip)).toBeLessThanOrEqual(cols)
    expect(shown(strip)).toMatch(/band-strip/)
    expect(shown(strip)).toMatch(/on claude/) // the branch keeps its prefix
  })
}

test('a band too short for a strip row puts it in the footer, in place of the hint', async ($, on) => {
  const clock = setup(on, { env: HOME })
  await $.session.start({ ...START, surface: 'desktop' })
  const footerOf = (tree: unknown): Node | undefined => byKey(tree, 'actions', 'Box')
  // 13 rows, as the desktop gives: each card keeps one fact, so no row is spare
  const short = await expanded($, clock, 'desktop', 95, 13)
  const footer = footerOf(short)
  expect(stripOf(footer)).toBeDefined()
  expect(shown(stripOf(footer))).toMatch(/claude-mod.*main/)
  expect(shown(footer)).not.toMatch(/Bring it back/)
  // the footer strip leaves the buttons their room
  expect(widthOf(stripOf(footer))).toBeLessThanOrEqual(95 - 30)
  // with rows to spare it heads the view, and the hint is back
  const tall = await expanded($, clock, 'desktop', 95, 40)
  expect(stripOf(footerOf(tall))).toBeUndefined()
  expect(stripOf(tall)).toBeDefined()
  expect(shown(footerOf(tall))).toMatch(/Bring it back/)
})

test("the strip has no ground of its own, so its text takes the host theme's colours", async ($, on) => {
  const clock = setup(on, { env: HOME })
  engine.git = { status: DIRTY, dirs: GIT_MAIN_TREE }
  await $.session.start({ ...START, surface: 'desktop' })
  const colors: string[] = []
  const visit = (n: Node | undefined): void => {
    if (n === undefined || n === null || typeof n !== 'object' || n.props?.position === 'absolute') return
    if (n.type === 'Text' && typeof n.props?.color === 'string') colors.push(n.props.color)
    for (const k of (n.children ?? []) as Node[]) visit(k)
  }
  visit(stripOf(await expanded($, clock, 'desktop')))
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
  const clock = setup(on, { env: HOME })
  engine.root = '/Users/me/workspace/an-unusually-long-project-folder-name-here'
  engine.repoRoot = engine.root
  engine.git = { status: DIRTY, dirs: GIT_MAIN_TREE }
  await $.session.start(START)
  for (const surface of ['terminal', 'desktop'] as const) {
    const strip = stripOf(await expanded($, clock, surface, 40))
    if (surface === 'terminal') expect(widthOf(strip)).toBeLessThanOrEqual(40)
    expect(strip?.props?.height).toBe(1)
    expect(shown(strip)).toMatch(/an-unu.*…/)
  }
})

test('a narrow strip never hides uncommitted changes', async ($, on) => {
  const clock = setup(on, { env: HOME })
  engine.root = WORKTREE
  engine.git = { status: DIRTY.replace('branch.head main', 'branch.head claude/a-rather-long-feature-branch'), dirs: WORKTREE_DIRS }
  await $.session.start(START)
  expect(shown(stripOf(await expanded($, clock, 'terminal', 40)))).toMatch(/±3/)
})

test('a clipped branch or path keeps its whole name for a reader', async ($, on) => {
  const clock = setup(on, { env: HOME })
  const long = 'claude/a-rather-long-feature-branch'
  engine.root = WORKTREE
  engine.git = { status: DIRTY.replace('branch.head main', `branch.head ${long}`), dirs: WORKTREE_DIRS }
  await $.session.start({ ...START, surface: 'desktop' })
  const alts = svgsOf(stripOf(await expanded($, clock, 'desktop', 60))).map(n => String(n.props?.alt))
  expect(alts).toContain(`branch ${long}`)
  expect(alts).toContain('folder ~/workspace/claude-mod/.claude/worktrees/band-strip')
})

test("the path's hover card says the whole state, so nothing a narrow line drops is lost", async ($, on) => {
  const clock = setup(on, { env: HOME })
  engine.git = { status: DIRTY, dirs: GIT_MAIN_TREE }
  await $.session.start({ ...START, surface: 'desktop' })
  const card = hoverCardOf(stripOf(await expanded($, clock, 'desktop')), 'ws:path')
  expect(textOf(card)).toBe('~/workspace/claude-mod: branch main, 3 changed, 2 ahead, 1 behind')
})

test("the strip's hover cards are drawn after all of it, each sharing its own piece's scope", async ($, on) => {
  const clock = setup(on, { env: HOME })
  engine.root = WORKTREE
  engine.git = { status: DIRTY, dirs: WORKTREE_DIRS }
  await $.session.start(START)
  for (const surface of ['terminal', 'desktop'] as const) {
    const strip = stripOf(await expanded($, clock, surface))
    const kids = ((strip?.children ?? []) as Node[]).filter(Boolean)
    const first = kids.findIndex(isCard)
    const found = cards(strip)
    const tracking = surface === 'desktop' ? ['ws:ahead', 'ws:behind'] : ['ws:ab']
    expect(found.map(([key]) => key)).toEqual(['ws:path', 'ws:head', 'ws:worktree', 'ws:changes', ...tracking])
    expect(kids.slice(first)).toEqual(found.map(([, card]) => card))
    expect(kids.slice(0, first).map(k => k.props?.key)).toEqual(['ws:where', 'ws:fill', 'ws:state'])
    expect(new Set(found.map(([, card]) => card.hover?.scope)).size).toBe(found.length)
    for (const [key, card] of found) {
      expect(byKey(strip, key, 'Box')?.hover?.scope).toBe(card.hover?.scope)
      expect(card.props).toMatchObject({ top: 0, display: 'none' })
      expect(card.props?.key).toBeUndefined()
      expect(card.hover?.display).toBe('flex')
    }
    // Ahead and behind, apart on the desktop, each explain the same.
    expect(new Set(tracking.map(key => textOf(hoverCardOf(strip, key))))).toEqual(new Set(['2 commits to push, 1 to pull']))
  }
})

/** Where the terminal's top strip, `cols` wide, puts its cards: on the
 *  path's side from where the piece starts, slid left only as far as it must
 *  to end within the strip's room; on the state's side ending where the piece
 *  ends, as wide as its text or the room left of that end. */
const expectStripCardsAt = (strip: Node | undefined, cols: number) => {
  const pad = Number(strip?.props?.paddingX)
  const room = cols - ROW_SLACK
  const side = (key: string) => ((byKey(strip, key, 'Box')?.children ?? []) as Node[]).filter(Boolean)
  let at = pad
  for (const piece of side('ws:where')) {
    const card = hoverCardOf(strip, String(piece.props?.key))
    if (card !== undefined) {
      const width = Math.min(textOf(card).length + 2, room)
      expect(card.props?.width).toBe(width)
      expect(card.props?.left).toBe(Math.max(0, Math.min(at, room - width)))
    }
    at += widthOf(piece)
  }
  let end = pad
  for (const piece of side('ws:state').reverse()) {
    const card = hoverCardOf(strip, String(piece.props?.key))
    if (card !== undefined) {
      expect(card.props?.right).toBe(end)
      expect(card.props?.left).toBeUndefined()
      expect(card.props?.width).toBe(Math.min(textOf(card).length + 2, room - end))
    }
    end += widthOf(piece)
  }
}

test("on the terminal a card on the path's side starts at its piece, and one on the state's side ends at its own", async ($, on) => {
  const clock = setup(on, { env: HOME })
  engine.root = WORKTREE
  engine.git = { status: DIRTY, dirs: WORKTREE_DIRS }
  await $.session.start(START)
  const strip = stripOf(await expanded($, clock, 'terminal', 120))
  expectStripCardsAt(strip, 120)
  expect(hoverCardOf(strip, 'ws:changes')?.props?.right).toBeGreaterThan(Number(strip?.props?.paddingX))
})

test("on a narrow terminal a card on the state's side still ends within the strip", async ($, on) => {
  const clock = setup(on, { env: HOME })
  engine.root = WORKTREE
  engine.git = { status: DIRTY, dirs: WORKTREE_DIRS }
  await $.session.start(START)
  const strip = stripOf(await expanded($, clock, 'terminal', 24))
  const changes = hoverCardOf(strip, 'ws:changes')
  expect(textOf(changes).length + 2).toBeGreaterThan(24 - ROW_SLACK - Number(changes?.props?.right))
  expectStripCardsAt(strip, 24)
})

test('a footer strip with no room for its cards still draws, and shows no card too narrow to read', async ($, on) => {
  const clock = setup(on, { env: HOME })
  engine.root = WORKTREE
  engine.git = { status: DIRTY, dirs: WORKTREE_DIRS }
  await $.session.start(START)
  for (const surface of ['terminal', 'desktop'] as const) {
    const strip = stripOf(byKey(await expanded($, clock, surface, 24, 12), 'actions', 'Box'))
    expect(strip).toBeDefined()
    // Its padding and one character, or the hover shows a bare patch.
    for (const [, card] of cards(strip)) expect(card.props?.width).toBeGreaterThanOrEqual(3)
  }
})

test('one commit to push reads as one', async ($, on) => {
  const clock = setup(on, { env: HOME })
  engine.git = { status: DIRTY.replace('+2 -1', '+1 -0'), dirs: GIT_MAIN_TREE }
  await $.session.start({ ...START, surface: 'desktop' })
  const text: string[] = []
  walk(stripOf(await expanded($, clock, 'desktop')), n => {
    if (n.type === 'Box' && n.props?.position === 'absolute') text.push(shown({ ...n, props: {} }))
  })
  expect(text).toContain('1 commit to push')
  expect(text.join('|')).not.toMatch(/0 to pull/)
})
