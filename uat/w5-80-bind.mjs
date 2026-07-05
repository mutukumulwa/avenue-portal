import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('uw →', await login(p, 'underwriter@medvex.co.ug'))
await p.goto(BASE + '/quotations', { waitUntil: 'networkidle2' }); await sleep(1500)
const qhref = await p.evaluate(() => { const tr = [...document.querySelectorAll('tbody tr')].find(x => /Nakuru/.test(x.innerText)); return [...tr.querySelectorAll('a')].map(a => a.getAttribute('href')).find(h => /quot/i.test(h)) })
await p.goto(BASE + qhref + '/bind', { waitUntil: 'networkidle2' }).catch(() => {})
if (!/bind/.test(p.url())) {
  await p.goto(BASE + qhref, { waitUntil: 'networkidle2' }); await sleep(1200)
  const box = await p.evaluate(() => { for (const n of document.querySelectorAll('a, button')) { if ((n.innerText || '').trim() === 'Record Acceptance') { const r = n.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } } } })
  await p.mouse.click(box.x, box.y); await sleep(1800)
}
console.log('bind URL:', p.url())

// STEP 1: acceptance method = Email reply
console.log(await p.evaluate(() => {
  const s = document.querySelector('select[name="method"]')
  const o = [...s.options].find(o => /Email/i.test(o.text)); s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true }))
  return 'method=' + o.text
}))
console.log('step1:', await clickText(p, 'button', 'Record Acceptance')); await sleep(3000)
let t = await p.evaluate(() => document.body.innerText)
console.log('STATUS:', (t.match(/status: (\w+)/) || [])[1], '| STEP2 area:', (t.match(/Step 2[^]*?(?=Step 3)/) || [''])[0].replace(/\n+/g, ' | ').slice(0, 400))
await shot(p, 'w5-80-step1-done')
const btns = () => p.evaluate(() => [...document.querySelectorAll('button')].filter(x => x.getClientRects().length && x.innerText.trim().length < 50 && !/OVERVIEW|MEMBERSHIP|CLINICAL|FINANCE|INSIGHTS|SUPPORT|REINSTATEMENTS|Log out/.test(x.innerText)).map(x => x.innerText.trim()))
console.log('BTNS:', JSON.stringify(await btns()))

// STEP 2: create members
const s2 = (await btns()).find(x => /create member|create group|generate/i.test(x))
if (s2) {
  console.log('\nstep2 clicking:', s2)
  await clickText(p, 'button', s2); await sleep(4000)
  t = await p.evaluate(() => document.body.innerText)
  console.log('STEP2 RESULT:', (t.match(/Step 2[^]*?(?=Step 3)/) || [''])[0].replace(/\n+/g, ' | ').slice(0, 500))
  console.log('errors:', JSON.stringify((t.match(/[^\n]*(error|fail|missing|required)[^\n]*/gi) || []).filter(x => x.length < 140).slice(0, 4)))
  await shot(p, 'w5-80-step2')
  console.log('BTNS:', JSON.stringify(await btns()))
}
await b.close()
console.log('DONE')
