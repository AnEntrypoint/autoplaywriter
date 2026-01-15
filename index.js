import { chromium } from '@playwright/test';

async function main() {
  console.log('[INIT] Launching Playwright browser with auto-enabling extension...');

  let browser;
  let page;

  try {
    // Launch visible browser (required for Playwriter extension to connect)
    console.log('[BROWSER] Launching Chromium in headed mode...');
    browser = await chromium.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-gpu']
    });

    console.log('[BROWSER] Browser launched successfully');

    // Create context and page
    console.log('[PAGE] Creating browser context and page...');
    const context = await browser.newContext();
    page = await context.newPage();

    // Navigate to localhost
    console.log('[NAV] Navigating to http://localhost...');
    try {
      await page.goto('http://localhost', { waitUntil: 'domcontentloaded', timeout: 5000 });
      console.log('[NAV] Navigation successful');
    } catch (err) {
      console.warn('[NAV] Navigation error (localhost may not be running):', err.message);
    }

    console.log('[READY] Browser is open and ready');
    console.log('[READY] Playwriter extension can auto-connect to this instance');
    console.log('[READY] Browser window is visible on your display');
    console.log('[READY] Press Ctrl+C to close');

    // Keep browser running
    await new Promise(() => {});

  } catch (error) {
    console.error('[ERROR] Failed to start:', error.message);
    if (browser) {
      await browser.close().catch(() => {});
    }
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
