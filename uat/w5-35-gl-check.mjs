import { launch, login, BASE, sleep, shot, bodyText, clickText } from './w5lib.mjs'

const b = await launch()
const p = await b.newPage()
console.log('finance →', await login(p, 'finance@medvex.co.ug'))

// General Ledger
await clickText(p, 'a', 'General Ledger') || await p.goto(BASE + '/general-ledger', { waitUntil: 'networkidle2' }).catch(() => {})
await sleep(2000)
console.log('URL:', p.url())
let t = await p.evaluate(() => document.body.innerText)
console.log('\n== GENERAL LEDGER (top 1800) ==\n', t.slice(t.indexOf('Ledger'), t.indexOf('Ledger') + 1800).replace(/\n{2,}/g, '\n'))
console.log('\nCLM refs:', JSON.stringify((t.match(/CLM-2026-\d+/g) || []).slice(0, 20)))
console.log('JE refs:', JSON.stringify((t.match(/JE[-\d]+|CLAIM_APPROVED|CLAIM_DECISION|SETTLEMENT|VOID/g) || []).slice(0, 20)))
await shot(p, 'w5-35-general-ledger')

// Account Ledger
await clickText(p, 'a', 'Account Ledger'); await sleep(2000)
console.log('\nURL:', p.url())
t = await p.evaluate(() => document.body.innerText)
console.log('\n== ACCOUNT LEDGER (top 1200) ==\n', t.slice(t.indexOf('Ledger'), t.indexOf('Ledger') + 1200).replace(/\n{2,}/g, '\n'))
await shot(p, 'w5-35-account-ledger')
await b.close()
console.log('DONE')
