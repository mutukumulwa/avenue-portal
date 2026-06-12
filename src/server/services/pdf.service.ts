import puppeteerCore from "puppeteer-core";
import puppeteer, { Browser } from "puppeteer";
import chromium from "@sparticuz/chromium";

// ─── PUPPETEER BROWSER POOL ───────────────────────────────────────────────────
// A single shared browser instance with up to MAX_PAGES concurrent pages.
// The instance is created on first use and reused across requests.

const MAX_PAGES = 3;
let browser: Browser | null = null;
let activePages = 0;

async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.connected) {
    if (process.env.VERCEL) {
      browser = await puppeteerCore.launch({
        args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
      }) as unknown as Browser;
    } else {
      browser = await puppeteer.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
      });
    }
  }
  return browser;
}

// ─── PDF SERVICE ─────────────────────────────────────────────────────────────

export const pdfService = {
  /**
   * Renders an HTML string to a PDF buffer using Puppeteer.
   * Enforces a simple concurrency cap to avoid resource exhaustion.
   */
  async renderToPdf(html: string, opts: { format?: "A4" | "Letter"; landscape?: boolean } = {}): Promise<Buffer> {
    // Wait if at concurrency cap
    const wait = (): Promise<void> =>
      new Promise((resolve) => setTimeout(resolve, 200));
    while (activePages >= MAX_PAGES) {
      await wait();
    }

    activePages++;
    const b = await getBrowser();
    const page = await b.newPage();

    try {
      await page.setContent(html, { waitUntil: "load", timeout: 30_000 });
      const pdf = await page.pdf({
        format: opts.format ?? "A4",
        landscape: opts.landscape ?? false,
        printBackground: true,
        margin: { top: "12mm", bottom: "12mm", left: "14mm", right: "14mm" },
      });
      return Buffer.from(pdf);
    } finally {
      await page.close();
      activePages--;
    }
  },
};
