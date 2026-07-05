import { launch, login, BASE, sleep, shot, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('finance →', await login(p, 'finance@medvex.co.ug'))

// what hrefs does the sidebar actually carry?
await clickText(p, 'button', 'FINANCE').catch(() => {})
await sleep(600)
const side = await p.evaluate(() => [...document.querySelectorAll('a')].map(a => a.getAttribute('href') + ' :: ' + (a.innerText || '').trim().replace(/\n.*/s, '')).filter(x => /ledger|billing|settle|gl|voucher|fund/i.test(x)))
console.log('SIDEBAR FIN LINKS:', JSON.stringify([...new Set(side)], null, 1))

for (const path of ['/general-ledger', '/gl', '/ledger', '/account-ledger', '/finance/gl', '/finance/ledger']) {
  const resp = await p.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null)
  await sleep(600)
  const is404 = await p.evaluate(() => /could not be found|404/.test(document.body.innerText))
  console.log(path, '→', resp ? resp.status() : 'ERR', is404 ? '404-page' : 'OK')
}
// admin comparison
const p2 = await b.newPage()
console.log('\nadmin →', await login(p2, 'admin@medvex.co.ug'))
await clickText(p2, 'button', 'FINANCE'); await sleep(700)
const side2 = await p2.evaluate(() => [...document.querySelectorAll('a')].map(a => a.getAttribute('href') + ' :: ' + (a.innerText || '').trim().replace(/\n.*/s, '')).filter(x => /ledger|billing|settle|gl|voucher|fund|commission|reconcil/i.test(x)))
console.log('ADMIN FIN LINKS:', JSON.stringify([...new Set(side2)], null, 1))
await b.close()
console.log('DONE')
