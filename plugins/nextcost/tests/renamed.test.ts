// nextcost was session-usage-band before 0.18.0: its old command and its
// settings' old names still work, and the new names win where both are set.

import { test, expect } from 'claude-code/testing'
import { HOUR_1, START, mountBand, resp, respond, runCommand, setup, shown, walk } from './helpers'

/** Whether a drawn tree paints any ground: plain paints none. */
const grounded = (tree: unknown): boolean => {
  let any = false
  walk(tree, n => {
    if (typeof n.props?.backgroundColor === 'string' && n.props.backgroundColor !== '') any = true
  })
  return any
}
/** Whether a drawn tree's text is ASCII alone, as the ascii tier draws it. */
const ascii = (tree: unknown): boolean => !/[^\x00-\x7f]/.test(shown(tree))

test('/usage-band, its old name, answers as /nextcost does', async ($, on) => {
  setup(on)
  await $.session.start(START)
  await respond($, resp(41_000, 0, 155_000, 12_000))
  for (const args of ['more', 'less', 'hide', 'show', 'sideways', 'layout'])
    expect(JSON.stringify(await runCommand($, args, 'usage-band'))).toBe(JSON.stringify(await runCommand($, args)))
  expect(JSON.stringify(await runCommand($, 'more', 'usage-band'))).toMatch(/nextcost expanded\./)
})

const CASES: ReadonlyArray<readonly [string, Record<string, string>, (tree: unknown) => boolean]> = [
  ['no setting: grounds and the band\'s own glyphs', {}, tree => grounded(tree) && !ascii(tree)],
  ['CC_BAND_APPEARANCE=plain, the old name: plain', { CC_BAND_APPEARANCE: 'plain' }, tree => !grounded(tree)],
  ['NEXTCOST_APPEARANCE wins over CC_BAND_APPEARANCE', { NEXTCOST_APPEARANCE: 'dark', CC_BAND_APPEARANCE: 'plain' }, grounded],
  ['CC_BAND_GLYPHS=ascii, the old name: ascii', { CC_BAND_GLYPHS: 'ascii' }, ascii],
  ['NEXTCOST_GLYPHS wins over CC_BAND_GLYPHS', { NEXTCOST_GLYPHS: 'unicode', CC_BAND_GLYPHS: 'ascii' }, tree => !ascii(tree)],
]
for (const [name, env, holds] of CASES)
  test(`settings: ${name}`, async ($, on) => {
    setup(on, { env: { ...HOUR_1, ...env } })
    await $.session.start(START)
    await respond($, resp(41_000, 0, 155_000, 12_000))
    const ui = await mountBand($, 'terminal', 110)
    expect(holds(await ui.drawn())).toBe(true)
    await ui.unmount()
  })
