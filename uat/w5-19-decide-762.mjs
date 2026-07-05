import { launch, login, BASE, sleep, shot, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('login →', await login(p, 'medical@medvex.co.ug'))
await p.goto(BASE + '/claims/cmr6e4jtd000m96vqhfhdwhwx', { waitUntil: 'networkidle2' })
await sleep(2000)

// 1) attempt submit WITHOUT over-cover confirmation
await p.evaluate(() => {
  const s = document.querySelector('select[name="action"]'); s.value = 'APPROVED'; s.dispatchEvent(new Event('change', { bubbles: true }))
  const a = document.querySelector('input[name="approvedAmount"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(a, '86000'); a.dispatchEvent(new Event('input', { bubbles: true }))
  const n = document.querySelector('textarea[name="notes"]'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(n, 'W5 re-test: attempt full approval above PA cover without confirmation'); n.dispatchEvent(new Event('input', { bubbles: true }))
  const c = document.querySelector('input[name="overCoverConfirmed"]'); if (c.checked) c.click()
})
await sleep(400)
console.log('submit #1 (no confirm):', await clickText(p, 'button', 'Submit Decision'))
await sleep(2500)
let t = await p.evaluate(() => document.body.innerText)
console.log('STATUS:', (t.match(/CLM-2026-00762[^]*?(CAPTURED|UNDER REVIEW|APPROVED|PENDING)/) || [])[1])
console.log('MSGS:', JSON.stringify((t.match(/[^\n]*(confirm|cover|exceed|above)[^\n]*/gi) || []).filter(x => x.length < 160).slice(0, 6)))
await shot(p, 'w5-19-no-confirm-attempt')

// 2) now confirm over-cover + note, submit
await p.evaluate(() => {
  const c = document.querySelector('input[name="overCoverConfirmed"]'); if (c && !c.checked) c.click()
  const note = document.querySelector('input[name="overCoverNote"]')
  if (note) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(note, 'Surgeon invoice includes theatre consumables; management approved (W5 test PR-015/PR-017).'); note.dispatchEvent(new Event('input', { bubbles: true })) }
})
await sleep(400)
console.log('\nsubmit #2 (confirmed):', await clickText(p, 'button', 'Submit Decision'))
await sleep(700)
// duplicate-click probe while first is in flight
console.log('submit #3 (double-click):', await clickText(p, 'button', 'Submit Decision'))
await sleep(3000)
t = await p.evaluate(() => document.body.innerText)
console.log('\nSTATUS NOW:', (t.match(/Review and adjudicate[^]*?(CAPTURED|UNDER REVIEW|APPROVED|PENDING[ _]APPROVAL|ROUTED)/) || t.match(/(CAPTURED|UNDER REVIEW|APPROVED|PENDING)/) || [])[1])
const wi = t.indexOf('ADJUDICATION TIMELINE')
console.log('\nTIMELINE:', t.slice(wi, wi + 800).replace(/\n{2,}/g, '\n'))
console.log('\nAPPROVAL/MATRIX MSGS:', JSON.stringify((t.match(/[^\n]*(approval|matrix|band|UGX|senior)[^\n]*/gi) || []).filter(x => x.length < 200).slice(0, 8)))
await shot(p, 'w5-19-after-decision')
await b.close()
console.log('DONE')
