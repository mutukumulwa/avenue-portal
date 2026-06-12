import puppeteer from 'puppeteer'

export const BASE = 'https://avenue-portal.vercel.app'
export const PW = 'AvenueAdmin2024!'
export const SHOTS = 'C:/Coding/avenue-portal/uat/screenshots'

export async function launch() {
  return puppeteer.launch({
    headless: 'new',
    defaultViewport: { width: 1440, height: 900 },
    args: ['--window-size=1460,950'],
  })
}

// Fill the login form via the UI and submit. Returns the landing URL.
export async function login(page, email, pw = PW) {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle2', timeout: 60000 })
  const emailSel = (await page.$('input[type="email"]')) ? 'input[type="email"]' : 'input[name="email"], input#email'
  await page.click(emailSel, { clickCount: 3 })
  await page.type(emailSel, email)
  await page.type('input[type="password"]', pw)
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ])
  await new Promise(r => setTimeout(r, 1500))
  return page.url()
}

// Navigate to a path, capture status, console errors, visible text snippet, screenshot.
export async function checkPage(page, path, name, opts = {}) {
  const { textLen = 500, settle = 1200 } = opts
  const errors = []
  const onConsole = m => { if (m.type() === 'error') errors.push(m.text().slice(0, 250)) }
  const onError = e => errors.push('PAGEERROR: ' + String(e).slice(0, 250))
  page.on('console', onConsole); page.on('pageerror', onError)
  let status = null
  try {
    const resp = await page.goto(BASE + path, { waitUntil: 'networkidle2', timeout: 60000 })
    status = resp ? resp.status() : null
  } catch (e) { errors.push('NAV-TIMEOUT: ' + e.message.slice(0, 120)) }
  await new Promise(r => setTimeout(r, settle))
  const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 700)).catch(() => '(no text)')
  if (name) await page.screenshot({ path: `${SHOTS}/${name}.png` }).catch(() => {})
  page.off('console', onConsole); page.off('pageerror', onError)
  console.log(`\n=== ${path} -> [${status}] ${page.url().replace(BASE, '')}`)
  console.log('TEXT:', text.slice(0, textLen))
  const realErrors = errors.filter(e => !/favicon|Failed to load resource.*404.*(png|ico)/i.test(e))
  if (realErrors.length) console.log('JS-ERRORS:', JSON.stringify(realErrors.slice(0, 5)))
  return { status, url: page.url(), text, errors: realErrors }
}

export async function clickByText(page, selector, textMatch) {
  const handles = await page.$$(selector)
  for (const h of handles) {
    const t = await h.evaluate(el => el.innerText || el.value || '')
    if (t.toLowerCase().includes(textMatch.toLowerCase())) { await h.click(); return true }
  }
  return false
}
