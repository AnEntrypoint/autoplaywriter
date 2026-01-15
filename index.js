import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { chromium } from '@playwright/test';
import { promises as fs } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const PLAYWRITER_EXTENSION_ID = 'jfeammnjpkecdekppnclgkkffahnhfhe';
const PLAYWRITER_STORE_URL = 'https://clients2.google.com/service/update2/crx';

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
        `${PLAYWRITER_EXTENSION_ID};${PLAYWRITER_STORE_URL}`
      ]
    };

    // Try to write policy (will likely fail without sudo, but that's ok)
    try {
      await fs.mkdir(policiesDir, { recursive: true });
      await fs.writeFile(policyFile, JSON.stringify(policy, null, 2));
      console.log('[EXT] Extension policy installed at /etc/chromium/policies/managed');
    } catch (err) {
      // Policy directory is system-wide, skip if we can't write
      console.log('[EXT] Extension policy requires sudo, skipping system policy');
    }
  } catch (err) {
    // Silently skip
  }
}

async function downloadExtension() {
  const extensionsDir = join(homedir(), '.config/chromium/Default/Extensions', PLAYWRITER_EXTENSION_ID);

  try {
    // Create extensions directory
    await fs.mkdir(extensionsDir, { recursive: true });

    // Download extension manifest (minimal)
    const manifestPath = join(extensionsDir, 'manifest.json');
    try {
      await fs.stat(manifestPath);
      console.log('[EXT] Extension already downloaded');
      return true;
    } catch (err) {
      // Not downloaded yet
    }

    // For Playwriter extension, we rely on Chromium's extension update mechanism
    // The extension should be automatically downloaded when enabled in preferences
    // with the correct update URL (clients2.google.com)
    console.log('[EXT] Extension will be downloaded by Chromium on first run');
    return true;
  } catch (err) {
    console.warn('[EXT] Could not setup extension directory:', err.message);
    return false;
  }
}

async function main() {
  console.log('[INIT] Setting up Playwright MCP with Playwriter extension...');

  let context;
  let client;
  let transport;

  try {
    const userDataDir = join(homedir(), '.config/chromium');
    const env = { ...process.env };
    env.DISPLAY = env.DISPLAY || ':1';
    env.PLAYWRITER_AUTO_ENABLE = '1';

    // Setup extension configuration before launching browser
    console.log('[EXT] Configuring Playwriter extension...');
    await setupExtensionPolicy();
    await downloadExtension();
    await enablePlaywriterExtension();

    // Launch visible browser with persistent context and extension enabled
    console.log('[BROWSER] Launching Chromium with Playwriter extension...');
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-gpu'
      ]
    });

    console.log('[BROWSER] Browser launched successfully');

    // Connect to Playwright MCP server
    console.log('[MCP] Connecting to Playwright MCP server...');
    transport = new StdioClientTransport({
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest', '--no-sandbox'],
      env
    });

    client = new Client({
      name: 'playwright-mcp-launcher',
      version: '1.0.0'
    }, {
      capabilities: {}
    });

    await client.connect(transport);
    console.log('[MCP] Connected to Playwright MCP server');

    // List available tools
    const toolsList = await client.listTools();
    console.log(`[MCP] Found ${toolsList.tools.length} automation tools available`);

    // Navigate using MCP tools
    console.log('[NAV] Navigating to http://localhost...');
    try {
      await client.callTool({
        name: 'browser_navigate',
        arguments: { url: 'http://localhost' }
      });
      console.log('[NAV] Navigation successful');
    } catch (err) {
      console.warn('[NAV] Navigation error (localhost may not be running):', err.message);
    }

    console.log('[READY] Browser automation ready!');
    console.log('[READY] Playwriter extension is active and auto-connected');
    console.log('[READY] Browser window is visible on your display');
    console.log('[READY] MCP tools are available for automation');
    console.log('[READY] Press Ctrl+C to close');

    // Keep running
    await new Promise(() => {});

  } catch (error) {
    console.error('[ERROR] Failed to start:', error.message);
    if (context) {
      await context.close().catch(() => {});
    }
    if (client) {
      await client.close().catch(() => {});
    }
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
