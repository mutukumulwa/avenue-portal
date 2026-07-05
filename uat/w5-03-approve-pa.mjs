import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('login →', await login(p, 'medical@medvex.co.ug'))

await p.goto(BASE + '/preauth', { waitUntil: 'networkidle2' })
await sleep(1200)
// open PA-2026-00010
const href = await p.evaluate(() => {
  const tr = [...document.querySelectorAll('tbody tr')].find(x => /PA-2026-00010/.test(x.innerText))
  return tr?.querySelector('a')?.getAttribute('href') || null
})
console.log('PA href:', href)
await p.goto(BASE + href, { waitUntil: 'networkidle2' })
await sleep(1500)
console.log('\n== PA DETAIL (before) ==\n', await bodyText(p, 1400))
const btns = () => p.evaluate(() => [...document.querySelectorAll('button')].filter(x => x.offsetParent && x.innerText.trim() && !/OVERVIEW|MEMBERSHIP|CLINICAL|FINANCE|INSIGHTS|COMPLIANCE|SUPPORT|REINSTATEMENTS|Log out|▸|▾/.test(x.innerText)).map(x => x.innerText.trim()))
console.log('ACTIONS:', JSON.stringify(await btns()))
await shot(p, 'w5-03-pa-detail-before')

// Stage 1: send for medical review
const s1 = await clickText(p, 'button', 'Medical Review')
console.log('\nStage1 clicked:', s1)
await sleep(2500)
console.log('ACTIONS NOW:', JSON.stringify(await btns()))

// Stage 2: approve — look for approval amount input then submit approval
const inputs = await p.evaluate(() => [...document.querySelectorAll('input, textarea')].filter(i => i.offsetParent).map(i => `${i.type || i.tagName} name=${i.name} ph=${i.placeholder} val=${i.value}`))
console.log('INPUTS:', JSON.stringify(inputs))
const s2 = (await clickText(p, 'button', 'Approv')) || (await clickText(p, 'button', 'Submit'))
console.log('Stage2 clicked:', s2)
await sleep(1500)
// a modal may appear — dump it
console.log('\n== MODAL/PAGE ==\n', await bodyText(p, 1600))
await shot(p, 'w5-03-pa-stage2')
const inputs2 = await p.evaluate(() => [...document.querySelectorAll('[role="dialog"] input, [role="dialog"] textarea')].map(i => `${i.type || i.tagName} name=${i.name} ph=${i.placeholder} val=${i.value}`))
console.log('DIALOG INPUTS:', JSON.stringify(inputs2))
await b.close()
console.log('PAUSE-DONE (inspect before final approve)')
