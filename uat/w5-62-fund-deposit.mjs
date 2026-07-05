import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('fund →', await login(p, 'fund@medvex.co.ug'))
await p.goto(BASE + '/fund/cmr60bv540033swvqz1tedol4', { waitUntil: 'networkidle2' }); await sleep(1800)
let t = await p.evaluate(() => document.body.innerText)
console.log('== BAMBURI FUND PAGE ==\n', t.slice(100, 1600).replace(/\n{2,}/g, '\n'))
const balBefore = (t.match(/CURRENT BALANCE\s*\n\s*(KES [\d,−-]+)/) || [])[1]
console.log('BALANCE BEFORE:', balBefore)
const btns = await p.evaluate(() => [...document.querySelectorAll('button, a')].filter(x => x.getClientRects().length && x.innerText.trim() && x.innerText.length < 40).map(x => x.innerText.trim()).filter(x => /deposit|statement|export|record/i.test(x)))
console.log('ACTIONS:', JSON.stringify(btns))
await shot(p, 'w5-62-fund-bamburi')

// record deposit
console.log('\nopen deposit:', await clickText(p, 'button', 'Record Deposit') || await clickText(p, 'button', 'Deposit') || await clickText(p, 'a', 'Deposit')); await sleep(1200)
const inputs = await p.evaluate(() => [...document.querySelectorAll('input, select, textarea')].filter(x => x.getClientRects().length).map(x => `${x.tagName}[${x.type || ''}] name=${x.name} ph="${x.placeholder}"`))
console.log('DEPOSIT INPUTS:', JSON.stringify(inputs, null, 1))
console.log(await p.evaluate(() => {
  const setV = (i, v) => { const proto = i.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })) }
  const vis = [...document.querySelectorAll('input, textarea')].filter(x => x.getClientRects().length)
  const amt = vis.find(i => i.type === 'number' || /amount/i.test(i.name + i.placeholder)); if (amt) setV(amt, '250000')
  const ref = vis.find(i => /ref/i.test(i.name + i.placeholder)); if (ref) setV(ref, 'W5-DEP-001 EFT')
  const note = vis.find(i => i.tagName === 'TEXTAREA'); if (note) setV(note, 'W5 F3 test deposit')
  const date = vis.find(i => i.type === 'date'); if (date) setV(date, '2026-07-04')
  return `amt=${!!amt} ref=${!!ref} date=${!!date}`
}))
await sleep(300)
console.log('save:', await clickText(p, 'button', 'Record') || await clickText(p, 'button', 'Save') || await clickText(p, 'button', 'Confirm') || await clickText(p, 'button', 'Submit'))
await sleep(3000)
t = await p.evaluate(() => document.body.innerText)
const balAfter = (t.match(/CURRENT BALANCE\s*\n\s*(KES [\d,−-]+)/) || [])[1]
console.log('\nBALANCE AFTER:', balAfter)
console.log('recent activity top:', (t.match(/RECENT ACTIVITY[^]*?(?=Large|$)/) || [''])[0].replace(/\n+/g, ' | ').slice(0, 300))
await shot(p, 'w5-62-after-deposit')
await b.close()
console.log('DONE')
