import { launch, login, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
const net = []
p.on('response', async r => {
  if (r.request().method() === 'POST') net.push({ url: r.url().replace('https://avenue-portal.vercel.app', ''), status: r.status() })
})
await login(p, 'admin@avenue.co.ke')

await p.goto(BASE + '/quotations/cmpy472t7000004jviv2tynqf/assess', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1500))
net.length = 0

// expand accordion
await p.evaluate(() => {
  const el = [...document.querySelectorAll('button, summary, [role="button"]')].find(x => /add life/i.test(x.innerText) && x.innerText.trim().length < 15)
  el?.click()
})
await new Promise(r => setTimeout(r, 1000))
const formInfo = await p.evaluate(() => {
  const i = document.querySelector('input[name="firstName"]')
  if (!i || !i.offsetParent) return { visible: false }
  const form = i.closest('form')
  return {
    visible: true,
    formButtons: form ? [...form.querySelectorAll('button')].map(x => ({ t: x.innerText.trim(), type: x.type, vis: !!x.offsetParent })) : null,
  }
})
console.log('FORM:', JSON.stringify(formInfo, null, 1))

if (formInfo.visible) {
  await p.click('input[name="firstName"]'); await p.keyboard.type('Lonnie')
  await p.click('input[name="lastName"]'); await p.keyboard.type('Lifetest')
  await p.click('input[name="nationalId"]'); await p.keyboard.type('77665544')
  await p.evaluate(() => {
    const d = document.querySelector('input[name="dateOfBirth"]')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(d, '1992-09-09'); d.dispatchEvent(new Event('input', { bubbles: true })); d.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/5.2g-before-submit.png' })
  const submitted = await p.evaluate(() => {
    const form = document.querySelector('input[name="firstName"]')?.closest('form')
    if (!form) return 'no form'
    const btn = [...form.querySelectorAll('button')].find(x => x.type === 'submit')
    if (btn) { btn.click(); return 'clicked ' + btn.innerText.trim() }
    form.requestSubmit(); return 'requestSubmit'
  })
  console.log('SUBMIT:', submitted)
  await new Promise(r => setTimeout(r, 6000))
  console.log('POSTs:', JSON.stringify(net))
  const t1 = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
  const li = t1.indexOf('Lives on Submission')
  console.log('RESULT:', t1.slice(li, li + 200))
  await p.screenshot({ path: 'C:/Coding/avenue-portal/uat/screenshots/5.2g-after-submit.png' })
}
await b.close()
console.log('DONE')
