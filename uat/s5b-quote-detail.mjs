import { launch, login, checkPage, BASE } from './lib.mjs'

const b = await launch()
const p = await b.newPage()
await login(p, 'admin@avenue.co.ke')

await p.goto(BASE + '/quotations', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1500))
const hrefs = await p.evaluate(() =>
  [...document.querySelectorAll('a[href^="/quotations/"]')]
    .map(a => ({ href: a.getAttribute('href'), row: a.closest('tr')?.innerText.replace(/\s+/g, ' ').slice(0, 60) }))
    .filter(x => !/calculator|new$/.test(x.href))
)
console.log('QUOTE LINKS:', JSON.stringify(hrefs, null, 1))

const draft = hrefs.find(x => /DRAFT/i.test(x.row || ''))?.href || hrefs[0]?.href
const accepted = hrefs.find(x => /ACCEPTED/i.test(x.row || ''))?.href

if (draft) {
  await checkPage(p, draft, '5.4-draft-detail', { textLen: 900 })
  await checkPage(p, draft + '/build', '5.4-draft-build')
  await checkPage(p, draft + '/assess', '5.4-draft-assess')
}
if (accepted) {
  await checkPage(p, accepted, '5.5-accepted-detail', { textLen: 700 })
  await checkPage(p, accepted + '/bind', '5.5-accepted-bind')
}

await b.close()
console.log('DONE S5B')
