// The workspace: git state from porcelain v2, and the folder path, as the band words them.

export type GitState = Readonly<{
  /** The branch, or undefined when HEAD is detached. */
  branch: string | undefined
  /** The short commit (7 chars), for a detached HEAD or a branch with no commits yet (undefined then). */
  commit: string | undefined
  /** The linked worktree's folder name; undefined in the main working tree. */
  worktree: string | undefined
  /** Files with uncommitted changes, staged, unstaged or untracked, each counted once. */
  changed: number
  /** Commits ahead of / behind the upstream; undefined when there is no upstream. */
  ahead: number | undefined
  behind: number | undefined
}>

/** Where the session is: its project, home-relative, git there, and, for a
 *  linked worktree, its main repository's folder name. */
export type Workspace = Readonly<{ path: string; git: GitState | undefined; repoName: string | undefined }>

/** Status without the index lock, so the band never blocks a commit, and
 *  without a repository's own fsmonitor, a program its config could name.
 *  Untracked files follow the user's own setting. */
export const GIT_STATUS_ARGV: readonly string[] = [
  'git',
  '-c',
  'core.fsmonitor=false',
  '--no-optional-locks',
  'status',
  '--porcelain=v2',
  '--branch',
]

/** Three lines: git-dir, common-dir, toplevel. */
export const GIT_DIRS_ARGV: readonly string[] = [
  'git',
  'rev-parse',
  '--path-format=absolute',
  '--git-dir',
  '--git-common-dir',
  '--show-toplevel',
]

const lines = (text: string): string[] => text.split(/\r?\n/).map(line => line.replace(/\r$/, ''))

const trimSlash = (p: string): string => (p.length > 1 ? p.replace(/\/+$/, '') : p)

const basename = (p: string): string => trimSlash(p).split('/').pop() ?? ''

/** Porcelain v2 entries that are changes: ordinary, renamed, unmerged, untracked. */
const CHANGED = /^[12u?] /

const isAbsolute = (p: string): boolean => /^(\/|[A-Za-z]:[\\/])/.test(p)

/** The worktree's folder name when git-dir and common-dir differ; else
 *  undefined. Git before 2.31 echoes the unknown `--path-format` back and
 *  answers relative paths, which can differ in the main tree, so only three
 *  absolute lines count. */
const worktreeName = (dirs: string): string | undefined => {
  const found = lines(dirs).filter(line => line !== '')
  if (found.length !== 3 || !found.every(isAbsolute)) return undefined
  const [gitDir, commonDir, top] = found
  if (!gitDir || !commonDir || !top) return undefined
  return trimSlash(gitDir) === trimSlash(commonDir) ? undefined : basename(top) || undefined
}

/** Undefined without a `# branch.head` line: not a repo, or not porcelain v2. */
export const parseGitState = (status: string, dirs: string): GitState | undefined => {
  let head: string | undefined
  let oid: string | undefined
  let ahead: number | undefined
  let behind: number | undefined
  let changed = 0
  for (const line of lines(status)) {
    if (line.startsWith('# branch.head ')) head = line.slice('# branch.head '.length)
    else if (line.startsWith('# branch.oid ')) oid = line.slice('# branch.oid '.length)
    else if (line.startsWith('# branch.ab ')) {
      const m = /^# branch\.ab \+(\d+) -(\d+)$/.exec(line)
      if (m) {
        ahead = Number(m[1])
        behind = Number(m[2])
      }
    } else if (CHANGED.test(line)) changed++
  }
  if (head === undefined) return undefined
  return {
    branch: head === '(detached)' ? undefined : head,
    commit: oid && oid !== '(initial)' ? oid.slice(0, 7) : undefined,
    worktree: worktreeName(dirs),
    changed,
    ahead,
    behind,
  }
}

/** `~` for home and `~/…` under it; anything else unchanged. */
export const homeRelative = (path: string, home: string | undefined): string => {
  const h = home?.replace(/\/+$/, '')
  if (!h) return path
  if (path === h || path === `${h}/`) return '~'
  return path.startsWith(`${h}/`) ? `~${path.slice(h.length)}` : path
}

/** The parent keeps its trailing slash; a root is all name. */
export const splitPath = (path: string): Readonly<{ parent: string; name: string }> => {
  const p = trimSlash(path)
  const cut = p.lastIndexOf('/')
  if (p === '/' || cut < 0) return { parent: '', name: p }
  return { parent: p.slice(0, cut + 1), name: p.slice(cut + 1) }
}

/** One plain line for a screen reader or a hover. */
export const gitSummary = (g: GitState): string => {
  const parts = [
    g.branch !== undefined ? `branch ${g.branch}` : g.commit ? `detached at ${g.commit}` : 'detached',
  ]
  if (g.branch !== undefined && !g.commit) parts.push('no commits yet')
  if (g.worktree) parts.push(`worktree ${g.worktree}`)
  parts.push(g.changed ? `${g.changed} changed` : 'clean')
  if (g.ahead) parts.push(`${g.ahead} ahead`)
  if (g.behind) parts.push(`${g.behind} behind`)
  return parts.join(', ')
}
