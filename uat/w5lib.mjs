import puppeteer from 'puppeteer'

export const BASE = 'http://localhost:3000'
export const PW = 'MedvexAdmin2024!'
export const SHOTS = decodeURIComponent(new URL('./04_Evidence/Screenshots', import.meta.url).pathname)

export async function launch() {
  return puppeteer.launch({
    headless: 'new',
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    defaultViewport: { width: 1440, height: 900 },
    args: ['--window-size=1460,950', '--no-sandbox'],
  })
}

export async function login(page, email, pw = PW) {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle2', timeout: 60000 })
  await page.click('input[type="email"]', { clickCount: 3 })
  await page.type('input[type="email"]', email)
  await page.type('input[type="password"]', pw)
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ])
  await sleep(1500)
  return page.url()
}

export const sleep = ms => new Promise(r => setTimeout(r, ms))

export async function shot(page, name) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false }).catch(e => console.log('shot-fail', e.message))
  console.log(`[shot] ${name}.png`)
}

export async function bodyText(page, len = 1200) {
  return page.evaluate(l => document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, l), len)
}

// Fire the full pointer sequence the app's custom comboboxes need.
export async function pointerClick(page, el) {
  await el.evaluate(node => {
    const fire = (type, Ctor = PointerEvent) => node.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true, pointerId: 1 }))
    fire('pointerdown'); node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    fire('pointerup'); node.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }))
    node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

export async function clickText(page, selector, match, { pointer = false } = {}) {
  const handles = await page.$$(selector)
  for (const h of handles) {
    const t = (await h.evaluate(el => el.innerText || el.value || '')).trim()
    const visible = await h.evaluate(el => !!el.offsetParent || el.getClientRects().length > 0)
    if (visible && t.toLowerCase().includes(match.toLowerCase())) {
      if (pointer) await pointerClick(page, h); else await h.click()
      return t
    }
  }
  return null
}

// Open a combobox (by its visible trigger text or aria role order), type a query, pick first/matching option.
export async function combo(page, triggerMatch, query, optionMatch = query) {
  const trig = await page.$$('[role="combobox"], button[aria-haspopup="listbox"], button[aria-haspopup="dialog"]')
  let opened = false
  for (const h of trig) {
    const t = (await h.evaluate(el => el.innerText || '')).trim()
    const visible = await h.evaluate(el => !!el.offsetParent)
    if (visible && t.toLowerCase().includes(triggerMatch.toLowerCase())) { await pointerClick(page, h); opened = true; break }
  }
  if (!opened) return 'trigger-not-found:' + triggerMatch
  await sleep(600)
  const input = await page.$('[cmdk-input], [role="dialog"] input, [role="listbox"] input, input[placeholder*="Search" i]')
  if (input && query) { await input.type(query, { delay: 30 }); await sleep(900) }
  const opts = await page.$$('[cmdk-item], [role="option"]')
  for (const o of opts) {
    const t = (await o.evaluate(el => el.innerText || '')).trim()
    if (t.toLowerCase().includes(optionMatch.toLowerCase())) { await pointerClick(page, o); await sleep(400); return 'picked:' + t.slice(0, 80) }
  }
  return 'option-not-found (had ' + opts.length + ' options)'
}
