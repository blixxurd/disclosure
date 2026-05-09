import { chromium, type Browser, type BrowserContext, type APIRequestContext } from 'playwright';
import { createLogger } from '@disclosure/shared/log';
import { NAV_TIMEOUT_MS } from './config.js';

const log = createLogger('');

export interface BrowserSession {
  ctx: BrowserContext;
  request: APIRequestContext;
  close: () => Promise<void>;
}

// Launch a real Chrome (channel 'chrome') with a visible window. Akamai's bot
// detection blocks every other configuration:
//   - curl / Node fetch (TLS fingerprint mismatch)         → 403
//   - Playwright bundled chromium (any mode)                → 403
//   - Playwright real Chrome with headless: true            → 403
//   - Playwright real Chrome with headless: false           → 200 ✓
//
// The headed window is the price of entry. After the page loads /UFO/ once,
// Akamai's JS challenge passes and the resulting cookies let APIRequestContext
// issue fast bulk downloads without spinning up new pages.
export async function openBrowser(initialUrl: string): Promise<BrowserSession> {
  log.info('launching real Chrome (headed)');
  const browser: Browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
  });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();

  log.info('navigating to source page', { url: initialUrl });
  const resp = await page.goto(initialUrl, {
    waitUntil: 'domcontentloaded',
    timeout: NAV_TIMEOUT_MS,
  });
  const status = resp?.status() ?? 0;
  if (status !== 200) {
    await browser.close();
    throw new Error(`source page returned HTTP ${status} — Akamai challenge may have failed`);
  }

  // Wait for the Vue records list to populate. Confirms the page actually
  // booted (and that we have a working session for asset fetches).
  try {
    await page.waitForFunction(
      () => {
        const el = document.getElementById('recordCount');
        return el && parseInt(el.textContent || '0', 10) > 0;
      },
      { timeout: 30_000 },
    );
    const count = await page.locator('#recordCount').textContent();
    log.info('page populated', { recordCount: count });
  } catch {
    log.warn('record count never populated; continuing — manifest fetch may still work');
  }

  await page.close();

  return {
    ctx,
    request: ctx.request,
    close: async () => {
      await ctx.close();
      await browser.close();
    },
  };
}
