// The workspace strip: the line that says where the session is, its
// project, its git branch or worktree, changes and ahead/behind.

import type { RenderChildren, RenderElement } from 'claude-code'
import { clipMiddle } from './format'
import { ALT } from './icons'
import type { Kit } from './kit'
import { STRIP_GIVES_WAY, squeezeToFit, stripKeeps } from './layout'
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
/** Where a strip sits: on top, under a row of air, its text lined up with
 *  the cards' (`edge` is their border width); in the footer, in the room the
 *  buttons leave. */
export const stripPlacement = (place: 'top' | 'footer', edge: number) =>
  place === 'top' ? { paddingX: 1 + edge / 2, marginTop: 1 } : { flexGrow: 1, flexShrink: 1, minWidth: 0 }

const stripAt = (kit: Kit, ws: Workspace, squeeze: number, place: 'top' | 'footer', edge: number): RenderElement => {
  const { Box, Text, Svg, hoverCard, icon } = kit
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

  const where: RenderChildren[] = [
    <Box key="ws:path" flexDirection="row">
      {Svg ? icon('folder', BARE.icon, clipped ? `folder ${ws.path}` : ALT.folder) : null}
      {parentShown === '' ? null : <Text color={BARE.label} wrap="truncate-end">{parentShown}</Text>}
      <Text color={BARE.value} bold wrap="truncate-end">
        {name}
      </Text>
      {hoverCard(git === undefined ? ws.path : `${ws.path}: ${gitSummary(git)}`, 'left')}
    </Box>,
  ]
  if (git?.branch !== undefined) {
    const branch = clipMiddle(git.branch, kept('branchLong') ? Infinity : kept('branchShort') ? 24 : 12)
    where.push(
      <Box key="ws:head" flexDirection="row">
        {Svg ? icon('branch', BARE.branch, branch === git.branch ? ALT.branch : `branch ${git.branch}`) : <Text color={BARE.label}>{'on '}</Text>}
        <Text color={BARE.value} wrap="truncate-end">
          {branch}
        </Text>
        {hoverCard(`Branch ${git.branch}${git.commit === undefined ? ', no commits yet' : ''}: ${tracking(git)}`, 'left')}
      </Box>,
    )
  } else if (git !== undefined) {
    where.push(
      <Box key="ws:head" flexDirection="row">
        {Svg ? icon('commit', BARE.icon) : null}
        <Text color={BARE.label}>{git.commit === undefined ? 'detached' : 'detached at '}</Text>
        {git.commit === undefined ? null : <Text color={BARE.value}>{git.commit}</Text>}
        {hoverCard('HEAD is detached: new commits belong to no branch', 'left')}
      </Box>,
    )
  }
  if (git?.worktree !== undefined && kept('worktree')) {
    const of = kept('worktreeOf') && ws.repoName !== undefined ? ws.repoName : undefined
    where.push(
      <Box key="ws:worktree" flexDirection="row">
        {Svg ? icon('worktree', BARE.icon) : null}
        <Text color={BARE.label}>
          {of === undefined ? 'worktree' : 'worktree of '}
          {of === undefined ? null : <Text key="of" color={BARE.value}>{of}</Text>}
        </Text>
        {hoverCard(
          ws.repoName === undefined
            ? 'A linked worktree: its own checkout of the repository'
            : `A linked worktree: its own checkout, sharing ${ws.repoName}'s history`,
          'left',
        )}
      </Box>,
    )
  }

  const state: RenderChildren[] = []
  if (git !== undefined && git.changed > 0) {
    const word = kept('changedWord')
    state.push(
      <Box key="ws:changes" flexDirection="row">
        {Svg ? icon('changes', BARE.icon) : null}
        <Text color={BARE.value}>
          {`${!word && !Svg ? '±' : ''}${git.changed}`}
          {word ? <Text key="w" color={BARE.label}>{' changed'}</Text> : null}
        </Text>
        {hoverCard(`${git.changed} uncommitted change${git.changed === 1 ? '' : 's'}`, 'right')}
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
    const card = hoverCard(tracking(git), 'right')
    if (Svg) {
      // Icons a reader names, "ahead 2, behind 1", where ↑ ↓ read as arrows.
      for (const [side, n] of [['ahead', git.ahead], ['behind', git.behind]] as const) {
        if (n)
          state.push(
            <Box key={`ws:${side}`} flexDirection="row">
              {icon(side, BARE.icon)}
              <Text color={BARE.value}>{String(n)}</Text>
              {card}
            </Box>,
          )
      }
    } else {
      state.push(
        <Box key="ws:ab" flexDirection="row">
          <Text color={BARE.value}>{[git.ahead ? `↑${git.ahead}` : '', git.behind ? `↓${git.behind}` : ''].filter(Boolean).join(' ')}</Text>
          {card}
        </Box>,
      )
    }
  }

  return (
    <Box
      key="strip"
      flexDirection="row"
      flexWrap="nowrap"
      overflow="hidden"
      height={1}
      {...stripPlacement(place, edge)}
    >
      <Box key="ws:where" flexDirection="row" columnGap={Svg ? 2 : 0} flexShrink={1} minWidth={0} overflow="hidden">
        {joined('where', where)}
      </Box>
      <Box key="ws:fill" flexGrow={1} minWidth={2} />
      <Box key="ws:state" flexDirection="row" columnGap={Svg ? 2 : 0} flexShrink={0}>
        {joined('state', state)}
      </Box>
    </Box>
  )
}

/** The strip at the first squeeze that fits `room` columns. `place` is the
 *  view's top, or the footer when the band is short of rows; `edge` is the
 *  cards' border width, so the strip's text lines up with theirs. */
export const drawStrip = (kit: Kit, ws: Workspace, place: 'top' | 'footer', edge: number, room: number): RenderElement =>
  squeezeToFit(squeeze => stripAt(kit, ws, squeeze, place, edge), STRIP_GIVES_WAY.length, room, kit.measure)
