// Demo capture, not a test: the band's real terminal output at seven moments.
// tools/demos/build.sh copies this into the plugin's tests/ only while it runs.
import { test, expect } from 'claude-code/testing'
import { LONG, MIN, START, mountBand, resp, respond, setup, usage, FRESH, HOUR_1 } from './helpers'

test('capture: terminal frames', LONG, async ($, on) => {
  const clock = setup(on, { usage: FRESH, env: { ...HOUR_1, CLAUDE_CODE_PROMPT_CACHE_TTL: '1h' } })
  await $.session.start(START)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await respond(e => $.turn.step(e), resp(2_000, 0, 298_000, 3_000))
  usage.current = {
    ...usage.current,
    cost: { usd: 1.56 },
    context: { tokens: 303_000, window: 1_000_000, percent: 30 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 42, resetsAt: new Date(2 * 60 * MIN + 61 * MIN).toISOString() },
      { kind: 'seven_day', percentUsed: 61, resetsAt: new Date(3 * 24 * 60 * MIN).toISOString() },
    ],
  }
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  const ui = await mountBand($, 'terminal', 100)
  const snap = async (name: string) => console.log('FRAME ' + name + ' ' + JSON.stringify(await ui.drawn()))
  await clock.settle(); await snap('reply')
  await clock.advance(20 * MIN); await snap('m20')
  await clock.advance(25 * MIN); await snap('m45')
  await clock.advance(14 * MIN + 13_000); await snap('last')
  await clock.advance(20_000); await snap('last2')
  await clock.advance(2 * MIN); await snap('cold')
  await ui.press({ key: 'more' }); await snap('cards')
  expect(1).toBe(1)
  await ui.unmount()
})
