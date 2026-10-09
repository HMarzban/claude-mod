// Screenshot every film/f*.html through one headless Chrome over the DevTools
// protocol: launch once, then navigate and capture per frame.
import { spawn } from 'node:child_process'
import { readdirSync, writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const dir = process.argv[2]
const scale = Number(process.argv[3] ?? 1.5)
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const profile = mkdtempSync(join(tmpdir(), 'shoot-'))
const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${profile}`,
  '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] })

const wsUrl = await new Promise((resolve, reject) => {
  let buf = ''
  proc.stderr.on('data', d => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) resolve(m[1]) })
  setTimeout(() => reject(new Error('no devtools url')), 15000)
})
const port = new URL(wsUrl).port
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const page = targets.find(t => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise(r => ws.addEventListener('open', r))

let id = 0
const pending = new Map()
const waiters = []
ws.addEventListener('message', ev => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
  else if (msg.method) for (const w of [...waiters]) if (w.method === msg.method) { waiters.splice(waiters.indexOf(w), 1); w.resolve(msg) }
})
const send = (method, params = {}) => new Promise(resolve => { const i = ++id; pending.set(i, resolve); ws.send(JSON.stringify({ id: i, method, params })) })
const once = method => new Promise(resolve => waiters.push({ method, resolve }))

await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: scale, mobile: false })
const frames = readdirSync(dir).filter(f => /^f\d+\.html$/.test(f)).sort()
const t0 = Date.now()
for (const f of frames) {
  const loaded = once('Page.loadEventFired')
  await send('Page.navigate', { url: 'file://' + join(dir, f) })
  await loaded
  await send('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => true)', awaitPromise: true })
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(dir, f.replace('.html', '.png')), Buffer.from(shot.result.data, 'base64'))
}
console.log(`${frames.length} frames in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
ws.close()
proc.kill()
