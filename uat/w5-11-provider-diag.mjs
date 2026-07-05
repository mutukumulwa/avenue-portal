import { launch, login, BASE, sleep, shot, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('login →', await login(p, 'medical@medvex.co.ug'))
await p.goto(BASE + '/claims/new', { waitUntil: 'networkidle2' })
await sleep(1800)

for (const q of ['LifeCare', 'Life', 'UAT']) {
  const t = await clickText(p, 'button', 'Search by name, type or county')
  if (!t) { console.log('no trigger for', q, '— maybe still open; pressing Escape'); await p.keyboard.press('Escape'); await sleep(400); await clickText(p, 'button', 'Search by name, type or county') }
  await sleep(700)
  await p.keyboard.type(q, { delay: 50 })
  await sleep(1500)
  const popup = await p.evaluate(() => {
    const inp = [...document.querySelectorAll('input')].find(i => i.getClientRects().length && /filter|search/i.test(i.placeholder || ''))
    let root = inp; for (let k = 0; k < 6 && root; k++) root = root.parentElement
    return root ? root.innerText.replace(/\n+/g, ' | ').slice(0, 600) : '(no popup root)'
  })
  console.log(`\nQUERY "${q}" →`, popup)
  await p.keyboard.press('Escape'); await sleep(400)
  // clear by reopening fresh
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(1500)
  // re-pick member is not needed for the diagnostic
}
await shot(p, 'w5-11-provider-diag')
await b.close()
console.log('DONE')
