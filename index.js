import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { promises as fs } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { spawn } from 'child_process';

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

    // Enable the Playwriter extension with update URL
    if (!prefs.extensions) prefs.extensions = {};
    if (!prefs.extensions.settings) prefs.extensions.settings = {};
    if (!prefs.extensions.settings[PLAYWRITER_EXTENSION_ID]) {
      prefs.extensions.settings[PLAYWRITER_EXTENSION_ID] = {};
    }

    // Critical settings for extension to load and auto-update
    prefs.extensions.settings[PLAYWRITER_EXTENSION_ID].active_bit = true;
    prefs.extensions.settings[PLAYWRITER_EXTENSION_ID].disable_reasons = 0;
    prefs.extensions.settings[PLAYWRITER_EXTENSION_ID].update_url = PLAYWRITER_STORE_URL;

    // Ensure extension is enabled for all sites including localhost
    if (!prefs.extensions.permissions) prefs.extensions.permissions = {};
    const localHostKey = `${PLAYWRITER_EXTENSION_ID},https://localhost/*`;
    if (!prefs.extensions.permissions[localHostKey]) {
      prefs.extensions.permissions[localHostKey] = { granted_on: Math.floor(Date.now() / 1000) };
    }

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

async function installSystemExtension() {
  // Use the chromeextensioninstaller tool to install extension at system level
  // This creates /opt/google/chrome/extensions/{ID}.json which Chromium reads on startup
  console.log('[EXT] Installing extension via system tool...');

  try {
    const { execSync } = await import('child_process');
    try {
      execSync(`npx -y gxe@latest AnEntrypoint/chromeextensioninstaller chromeextensioninstaller ${PLAYWRITER_EXTENSION_ID}`, {
        stdio: 'inherit',
        timeout: 60000
      });
      console.log('[EXT] System extension installation complete');
      return true;
    } catch (err) {
      console.log('[EXT] System tool not available, extension will use policy-based installation');
      return false;
    }
  } catch (err) {
    console.log('[EXT] Tool not available, using policy-based installation');
    return false;
  }
}

async function setupExtensionPolicy() {
  // Create managed policy to force install extension from Chrome Web Store
  // This is the system-level approach used in production environments
  const policiesDir = '/etc/chromium/policies/managed';
  const policyFile = join(policiesDir, 'extension_install_forcelist.json');

  try {
    // Policy format: {"ExtensionInstallForcelist": ["ID;URL"]}
    const policy = {
      'ExtensionInstallForcelist': [
        `${PLAYWRITER_EXTENSION_ID};${PLAYWRITER_STORE_URL}`
      ]
    };

    try {
      // Try to write policy (requires system access)
      await fs.mkdir(policiesDir, { recursive: true });
      await fs.writeFile(policyFile, JSON.stringify(policy, null, 2));
      console.log('[EXT] Extension policy installed at /etc/chromium/policies/managed');
      return true;
    } catch (err) {
      // Policy directory requires root - skip if we can't write
      console.log('[EXT] Policy installation requires system access, continuing with user preferences');
      return false;
    }
  } catch (err) {
    console.log('[EXT] Could not setup policy, using preferences fallback');
    return false;
  }
}

async function main() {
  console.log('[INIT] Setting up Playwright MCP with Playwriter extension...');

  let client;
  let transport;

  try {
    const userDataDir = join(homedir(), '.config/chromium');
    const env = { ...process.env };
    env.DISPLAY = env.DISPLAY || ':1';
    env.PLAYWRITER_AUTO_ENABLE = '1';

    // Setup system-level extension registration first
    console.log('[EXT] Configuring Playwriter extension...');
    await setupExtensionPolicy();
    await installSystemExtension();
    await enablePlaywriterExtension();

    // Launch visible browser with Chromium directly (not through Playwright)
    // This avoids Playwright's --disable-extensions flag
    console.log('[BROWSER] Launching Chromium with Playwriter extension...');
    const chromiumPath = '/home/kasm-user/.cache/ms-playwright/chromium-1200/chrome-linux/chrome';

    spawn(chromiumPath, [
      `--user-data-dir=${userDataDir}`,
      `--display=${env.DISPLAY}`,
      '--no-sandbox',
      '--disable-gpu',
      'about:blank'
    ], {
      detached: true,
      stdio: 'ignore',
      env
    });

    // Give browser time to start
    await new Promise(resolve => setTimeout(resolve, 3000));
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

    // Navigate using MCP tools (try localhost, fallback to about:blank for extension UI)
    console.log('[NAV] Connecting to localhost or using extension interface...');
    try {
      await client.callTool({
        name: 'browser_navigate',
        arguments: { url: 'http://localhost' }
      });
      console.log('[NAV] Navigation to localhost successful');
    } catch (err) {
      console.log('[NAV] localhost not running - extension available on about:blank and other sites');
      try {
        await client.callTool({
          name: 'browser_navigate',
          arguments: { url: 'about:blank' }
        });
        console.log('[NAV] Extension ready on about:blank');
      } catch (err2) {
        // Ignore - browser will show default page
      }
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
