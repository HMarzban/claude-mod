// The workspace strip: the line that says where the session is, its
// project, its git branch or worktree, changes and ahead/behind.

import type { RenderChildren, RenderElement } from 'claude-code'
import { clipMiddle } from './format'
import { ALT } from './icons'
import type { CardPlace, Kit } from './kit'
import { STRIP_GIVES_WAY, isList, squeezeToFit, startsOf, stripKeeps } from './layout'
import { BARE } from './palette'
import { gitSummary, splitPath } from './workspace'
import type { GitState, Workspace } from './workspace'

// A bare line, no border or fill: the panel's heading, not a fifth metric.
// Its text lines up with the cards' text. It sits on the host's own ground,
// so its text takes theme keys and its icons the BARE hexes. The desktop
// spaces pieces with gaps and icons; a text surface says them in words,
// between ` · `. One row always: nothing in it wraps.
const commits = (n: number) => `${n} commit${n === 1 ? '' : 's'}`
/** Push and pull in words, leaving out a side with nothing on it. */
const tracking = (g: GitState): string => {
  if (g.ahead === undefined) return 'no upstream'
  const sides = [g.ahead ? `${commits(g.ahead)} to push` : '', g.behind ? `${g.behind} to pull` : ''].filter(Boolean)
  return sides.length === 0 ? 'up to date with its upstream' : sides.join(', ')
}
/** The key a drawn Box goes by, if any. */
const keyOf = (n: RenderChildren): unknown =>
  typeof n === 'object' && n !== null && !isList(n) && n.type === 'Box' ? n.props?.key : undefined

const stripAt = (kit: Kit, ws: Workspace, squeeze: number, place: 'top' | 'footer', edge: number, room: number): RenderElement => {
  const { Box, Text, Svg, measure, hoverable, hoverCard, icon } = kit
  const kept = (piece: (typeof STRIP_GIVES_WAY)[number]) => stripKeeps(squeeze, piece)
  const git = ws.git
  const { parent, name: fullName } = splitPath(ws.path)
  const name = clipMiddle(fullName, kept('nameLong') ? Infinity : kept('nameShort') ? 24 : 12)
  const shortParent = parent === '' ? '' : parent.startsWith('~/') ? '~/…/' : '…/'
  const parentShown = kept('parent') || shortParent.length >= parent.length ? parent : shortParent
  const clipped = parentShown !== parent || name !== fullName
  const joined = (side: string, pieces: RenderChildren[]): RenderChildren[] =>
    pieces.flatMap((piece, i) =>
      i === 0 || Svg ? [piece] : [<Text key={`${side}-sep${i}`} color={BARE.label}>{' · '}</Text>, piece],
    )

  // Each piece that explains itself on hover, in drawing order: its key and
  // its card's text, for the end of the strip; see the kit's hoverCard.
  const explained: Array<readonly [string, string]> = []
  /** The props of a piece keyed `key` that reveals `text` on hover. */
  const explains = (key: string, text: string) => {
    explained.push([key, text])
    return { key, ...hoverable(key) }
  }

  const where: RenderChildren[] = [
    <Box flexDirection="row" {...explains('ws:path', git === undefined ? ws.path : `${ws.path}: ${gitSummary(git)}`)}>
      {Svg ? icon('folder', BARE.icon, clipped ? `folder ${ws.path}` : ALT.folder) : null}
      {parentShown === '' ? null : <Text color={BARE.label} wrap="truncate-end">{parentShown}</Text>}
      <Text color={BARE.value} bold wrap="truncate-end">
        {name}
      </Text>
    </Box>,
  ]
  if (git?.branch !== undefined) {
    const branch = clipMiddle(git.branch, kept('branchLong') ? Infinity : kept('branchShort') ? 24 : 12)
    where.push(
      <Box flexDirection="row" {...explains('ws:head', `Branch ${git.branch}${git.commit === undefined ? ', no commits yet' : ''}: ${tracking(git)}`)}>
        {Svg ? icon('branch', BARE.branch, branch === git.branch ? ALT.branch : `branch ${git.branch}`) : <Text color={BARE.label}>{'on '}</Text>}
        <Text color={BARE.value} wrap="truncate-end">
          {branch}
        </Text>
      </Box>,
    )
  } else if (git !== undefined) {
    where.push(
      <Box flexDirection="row" {...explains('ws:head', 'HEAD is detached: new commits belong to no branch')}>
        {Svg ? icon('commit', BARE.icon) : null}
        <Text color={BARE.label}>{git.commit === undefined ? 'detached' : 'detached at '}</Text>
        {git.commit === undefined ? null : <Text color={BARE.value}>{git.commit}</Text>}
      </Box>,
    )
  }
  if (git?.worktree !== undefined && kept('worktree')) {
    const of = kept('worktreeOf') && ws.repoName !== undefined ? ws.repoName : undefined
    const text =
      ws.repoName === undefined
        ? 'A linked worktree: its own checkout of the repository'
        : `A linked worktree: its own checkout, sharing ${ws.repoName}'s history`
    where.push(
      <Box flexDirection="row" {...explains('ws:worktree', text)}>
        {Svg ? icon('worktree', BARE.icon) : null}
        <Text color={BARE.label}>
          {of === undefined ? 'worktree' : 'worktree of '}
          {of === undefined ? null : <Text key="of" color={BARE.value}>{of}</Text>}
        </Text>
      </Box>,
    )
  }

  const state: RenderChildren[] = []
  if (git !== undefined && git.changed > 0) {
    const word = kept('changedWord')
    state.push(
      <Box flexDirection="row" {...explains('ws:changes', `${git.changed} uncommitted change${git.changed === 1 ? '' : 's'}`)}>
        {Svg ? icon('changes', BARE.icon) : null}
        <Text color={BARE.value}>
          {`${!word && !Svg ? '±' : ''}${git.changed}`}
          {word ? <Text key="w" color={BARE.label}>{' changed'}</Text> : null}
        </Text>
      </Box>,
    )
  } else if (git !== undefined && kept('clean')) {
    state.push(
      <Text key="ws:clean" color={BARE.label}>
        clean
      </Text>,
    )
  }
  if (git !== undefined && (git.ahead || git.behind) && kept('aheadBehind')) {
    if (Svg) {
      // Icons a reader names, "ahead 2, behind 1", where ↑ ↓ read as arrows.
      for (const [side, n] of [['ahead', git.ahead], ['behind', git.behind]] as const) {
        if (n)
          state.push(
            <Box flexDirection="row" {...explains(`ws:${side}`, tracking(git))}>
              {icon(side, BARE.icon)}
              <Text color={BARE.value}>{String(n)}</Text>
            </Box>,
          )
      }
    } else {
      state.push(
        <Box flexDirection="row" {...explains('ws:ab', tracking(git))}>
          <Text color={BARE.value}>{[git.ahead ? `↑${git.ahead}` : '', git.behind ? `↓${git.behind}` : ''].filter(Boolean).join(' ')}</Text>
        </Box>,
      )
    }
  }

  // Each card at its piece: on the path's side from where the piece starts,
  // on the state's ending where it ends.
  const pad = place === 'top' ? 1 + edge / 2 : 0
  const spacing = Svg ? 2 : 0
  const whereLine = joined('where', where)
  const stateLine = joined('state', state)
  const stateFromEnd = [...stateLine].reverse()
  const placeOf = new Map<unknown, CardPlace>([
    ...startsOf(whereLine, spacing, measure).map((start, i) => [keyOf(whereLine[i]), { left: pad + start, room }] as const),
    ...startsOf(stateFromEnd, spacing, measure).map((end, i) => [keyOf(stateFromEnd[i]), { right: pad + end }] as const),
  ])
  const cards = explained.map(([key, text]) => hoverCard(key, text, placeOf.get(key) ?? { left: pad, room }))

  return (
    <Box
      key="strip"
      flexDirection="row"
      flexWrap="nowrap"
      overflow="hidden"
      height={1}
      {...(place === 'top' ? { paddingX: pad, marginTop: 1 } : { flexGrow: 1, flexShrink: 1, minWidth: 0 })}
    >
      <Box key="ws:where" flexDirection="row" columnGap={spacing} flexShrink={1} minWidth={0} overflow="hidden">
        {whereLine}
      </Box>
      <Box key="ws:fill" flexGrow={1} minWidth={2} />
      <Box key="ws:state" flexDirection="row" columnGap={spacing} flexShrink={0}>
        {stateLine}
      </Box>
      {cards}
    </Box>
  )
}

/** The strip at the first squeeze that fits `room` columns. `place` is the
 *  view's top, or the footer when the band is short of rows; `edge` is the
 *  cards' border width, so the strip's text lines up with theirs. */
export const drawStrip = (kit: Kit, ws: Workspace, place: 'top' | 'footer', edge: number, room: number): RenderElement =>
  squeezeToFit(squeeze => stripAt(kit, ws, squeeze, place, edge, room), STRIP_GIVES_WAY.length, room, kit.measure)
