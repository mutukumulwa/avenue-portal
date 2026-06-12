import { launch, login, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')

// 1) Add Life on Antler DRAFT quote
await p.goto(BASE + '/quotations/cmpy472t7000004jviv2tynqf/assess', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1500))
const hasForm = await p.evaluate(() => !!document.querySelector('input[name="firstName"]'))
console.log('Antler DRAFT assess has Add Life form:', hasForm)
if (hasForm) {
  // expand if collapsed: click the Add Life summary row
  const expanded = await p.evaluate(() => {
    const i = document.querySelector('input[name="firstName"]')
    return !!i.offsetParent
  })
  if (!expanded) {
    const pos = await p.evaluate(() => {
      const els = [...document.querySelectorAll('*')].filter(x => x.children.length < 4 && /add life/i.test(x.innerText || '') && x.innerText.trim().length < 20)
      const el = els[els.length - 1]
      if (!el) return null
      const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    })
    if (pos) { await p.mouse.click(pos.x, pos.y); await new Promise(r => setTimeout(r, 1000)) }
  }
  const vis = await p.evaluate(() => !!document.querySelector('input[name="firstName"]')?.offsetParent)
  console.log('form visible now:', vis)
  if (vis) {
    await p.click('input[name="firstName"]'); await p.keyboard.type('Lonnie')
    await p.click('input[name="lastName"]'); await p.keyboard.type('Lifetest')
    await p.click('input[name="nationalId"]'); await p.keyboard.type('77665544')
    await p.evaluate(() => {
      const d = document.querySelector('input[name="dateOfBirth"]')
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(d, '1992-09-09'); d.dispatchEvent(new Event('input', { bubbles: true })); d.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await p.evaluate(() => { [...document.querySelectorAll('button[type="submit"]')].find(x => x.offsetParent)?.click() })
    await new Promise(r => setTimeout(r, 4000))
    const t1 = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
    const li = t1.indexOf('Lives on Submission')
    console.log('AFTER ADD:', t1.slice(li, li + 300))
    await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/5.2f-antler-life.png' })
  }
}

// 2) Create Group on accepted UAT quote
await p.goto(BASE + '/quotations/cmq9v5y8q000304k3hevyxek9', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1500))
await p.evaluate(() => { [...document.querySelectorAll('button')].find(x => /create group/i.test(x.innerText))?.click() })
await new Promise(r => setTimeout(r, 6000))
console.log('\nAFTER CREATE GROUP:', p.url().replace(BASE, ''))
console.log('   ', await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 350)))
await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/5.5-create-group.png' })

await b.close()
console.log('DONE S5G')
