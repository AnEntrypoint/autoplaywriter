import { chromium } from '@playwright/test';
import { promises as fs } from 'fs';
import { homedir, platform } from 'os';
import { join } from 'path';

const PLAYWRITER_EXTENSION_ID = 'jfeammnjpkecdekppnclgkkffahnhfhe';

async function enablePlaywriterExtension() {
  // Get the Chromium preferences file path
  const prefsPath = join(homedir(), '.config/chromium/Default/Preferences');

  try {
    let prefs = {};

    // Try to read existing preferences
    try {
      const content = await fs.readFile(prefsPath, 'utf-8');
      prefs = JSON.parse(content);
    } catch (err) {
      // File doesn't exist yet - start with empty prefs
    }

    // Enable the Playwriter extension
    if (!prefs.extensions) prefs.extensions = {};
    if (!prefs.extensions.settings) prefs.extensions.settings = {};
    if (!prefs.extensions.settings[PLAYWRITER_EXTENSION_ID]) {
      prefs.extensions.settings[PLAYWRITER_EXTENSION_ID] = {};
    }
    prefs.extensions.settings[PLAYWRITER_EXTENSION_ID].active_bit = true;
    prefs.extensions.settings[PLAYWRITER_EXTENSION_ID].disable_reasons = 0;

    // Ensure directory exists
    await fs.mkdir(join(homedir(), '.config/chromium/Default'), { recursive: true });

    // Write preferences
    await fs.writeFile(prefsPath, JSON.stringify(prefs, null, 2));
    console.log('[EXT] Playwriter extension enabled in preferences');
    return true;
  } catch (err) {
    console.warn('[EXT] Could not modify preferences:', err.message);
    return false;
  }
}

async function setupExtensionPolicy() {
  // Create managed policies directory
  const policiesDir = '/etc/chromium/policies/managed';
  const policyFile = join(policiesDir, 'extension_install_forcelist.json');

  try {
    // This requires sudo - attempt but don't fail if it doesn't work
    const policy = {
      'ExtensionInstallForcelist': [
        `${PLAYWRITER_EXTENSION_ID};https://clients2.google.com/service/update2/crx`
      ]
    };

    // Try to write policy (will likely fail without sudo, but that's ok)
    try {
      await fs.mkdir(policiesDir, { recursive: true });
      await fs.writeFile(policyFile, JSON.stringify(policy, null, 2));
      console.log('[EXT] Extension policy installed');
    } catch (err) {
      // Policy directory is system-wide, skip if we can't write
    }
  } catch (err) {
    // Silently skip
  }
}

async function main() {
  console.log('[INIT] Launching Playwright browser with Playwriter extension...');

  let context;
  let page;

  try {
    // Use persistent user data directory
    const userDataDir = join(homedir(), '.config/chromium');

    // Enable extension in preferences BEFORE launching browser
    await enablePlaywriterExtension();

    // Launch visible browser with persistent context
    console.log('[BROWSER] Launching Chromium in headed mode...');
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-gpu'
      ]
    });

    console.log('[BROWSER] Browser launched successfully');

    // Create a new page
    console.log('[PAGE] Creating browser page...');
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
    console.log('[READY] Playwriter extension is enabled and can provide MCP interface');
    console.log('[READY] Browser window is visible on your display');
    console.log('[READY] Press Ctrl+C to close');

    // Keep browser running
    await new Promise(() => {});

  } catch (error) {
    console.error('[ERROR] Failed to start:', error.message);
    if (context) {
      await context.close().catch(() => {});
    }
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
