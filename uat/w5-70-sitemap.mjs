import { launch, login, BASE, sleep } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('admin →', await login(p, 'admin@medvex.co.ug'))
// expand every collapsible section
for (const sec of ['OVERVIEW', 'MEMBERSHIP', 'CLINICAL', 'FINANCE', 'INSIGHTS', 'COMPLIANCE', 'SUPPORT', 'REINSTATEMENTS']) {
  await p.evaluate(s => { const b = [...document.querySelectorAll('button')].find(x => x.innerText.trim().startsWith(s)); if (b && /▸/.test(b.innerText)) b.click() }, sec)
  await sleep(300)
}
const map = await p.evaluate(() => [...document.querySelectorAll('a')].filter(a => a.getClientRects().length && a.getAttribute('href')?.startsWith('/')).map(a => a.getAttribute('href') + ' :: ' + (a.innerText || '').trim().replace(/\n.*/s, '')))
console.log([...new Set(map)].join('\n'))
await b.close()
console.log('DONE')
