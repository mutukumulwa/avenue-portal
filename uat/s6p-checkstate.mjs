import { launch, login, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')
await p.goto(BASE + '/claims/cmq9vvmbz000504k3et826zlk', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 2000))
const t = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
const i = t.indexOf('Claim CLM')
console.log('STATE:', i >= 0 ? t.slice(i, i + 450) : t.slice(0, 300))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/6.7-reload.png' })

// also try: does Submit Decision open a dialog? (check what it does when clicked once more)
const acts = await p.evaluate(() => [...document.querySelectorAll('button')].filter(x => x.offsetParent).map(x => x.innerText.trim()).filter(x => x && !/OVERVIEW|MEMBERSHIP|CLINICAL|FINANCE|INSIGHTS|SUPPORT|REINSTATEMENTS|Log out/.test(x)))
console.log('ACTIONS:', JSON.stringify(acts))
await b.close()
console.log('DONE')
