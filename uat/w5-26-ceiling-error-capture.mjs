import { launch, login, BASE, sleep, shot, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
const hits = []
p.on('response', async r => {
  try {
    if (r.request().method() !== 'POST') return
    const url = r.url()
    if (!/localhost:3000/.test(url)) return
    const body = await r.text().catch(() => '')
    hits.push({ url: url.replace(BASE, ''), status: r.status(), body: body.slice(0, 600) })
  } catch {}
})
console.log('login →', await login(p, 'medical@medvex.co.ug'))
await p.goto(BASE + '/claims', { waitUntil: 'networkidle2' }); await sleep(1200)
const href = await p.evaluate(() => [...document.querySelectorAll('tbody tr')].find(x => /CLM-2026-00763/.test(x.innerText))?.querySelector('a')?.getAttribute('href'))
await p.goto(BASE + href, { waitUntil: 'networkidle2' }); await sleep(1800)
hits.length = 0

await p.evaluate(() => {
  const s = document.querySelector('select[name="action"]'); s.value = 'APPROVED'; s.dispatchEvent(new Event('change', { bubbles: true }))
  const a = document.querySelector('input[name="approvedAmount"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(a, '86000'); a.dispatchEvent(new Event('input', { bubbles: true }))
  const n = document.querySelector('textarea[name="notes"]'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(n, 'W5 PR-014: full-amount approval attempt (capture rejection)'); n.dispatchEvent(new Event('input', { bubbles: true }))
  const c = document.querySelector('input[name="overCoverConfirmed"]'); if (c && !c.checked) c.click()
  const note = document.querySelector('input[name="overCoverNote"]')
  if (note) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(note, 'Testing ceiling block'); note.dispatchEvent(new Event('input', { bubbles: true })) }
})
await sleep(400)
console.log('submit:', await clickText(p, 'button', 'Submit Decision'))
// poll for toasts every 400ms for 6s
for (let i = 0; i < 15; i++) {
  await sleep(400)
  const toasts = await p.evaluate(() => [...document.querySelectorAll('[role="status"], [role="alert"], [class*="toast" i], [class*="sonner" i], [data-sonner-toast]')].map(e => e.innerText.trim()).filter(Boolean))
  if (toasts.length) { console.log('TOASTS:', JSON.stringify([...new Set(toasts)])); break }
}
await sleep(1500)
console.log('\nPOST RESPONSES:')
for (const h of hits) console.log(`[${h.status}] ${h.url}\n  ${h.body.replace(/\n/g, ' ')}`)
const t = await p.evaluate(() => document.body.innerText)
console.log('\nSTATUS:', (t.match(/CLM-2026-00763[^]*?(CAPTURED|APPROVED|UNDER REVIEW)/) || [])[1])
await shot(p, 'w5-26-ceiling-rejection')
await b.close()
console.log('DONE')
