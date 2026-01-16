import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { promises as fs } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { spawn } from 'child_process';

const EXTENSION_ID = 'jfeammnjpkecdekppnclgkkffahnhfhe';
const CHROMIUM_PATH = '/home/kasm-user/.cache/ms-playwright/chromium-1200/chrome-linux/chrome';

async function configureExtension() {
  const prefsPath = join(homedir(), '.config/chromium/Default/Preferences');

  try {
    let prefs = {};
    try {
      const content = await fs.readFile(prefsPath, 'utf-8');
      prefs = JSON.parse(content);
    } catch (e) {
      // File doesn't exist - start fresh
    }

    // Ensure extension structure
    if (!prefs.extensions) prefs.extensions = {};
    if (!prefs.extensions.settings) prefs.extensions.settings = {};

    prefs.extensions.settings[EXTENSION_ID] = {
      active_bit: true,
      disable_reasons: 0
    };

    // Create directory and write
    await fs.mkdir(join(homedir(), '.config/chromium/Default'), { recursive: true });
    await fs.writeFile(prefsPath, JSON.stringify(prefs, null, 2));

    console.log('[CONFIG] Extension configured in preferences');
    return true;
  } catch (err) {
    console.warn('[CONFIG] Could not write preferences:', err.message);
    return false;
  }
}

async function launchBrowser() {
  console.log('[BROWSER] Launching Chromium...');

  const userDataDir = join(homedir(), '.config/chromium');

  return new Promise((resolve, reject) => {
    const proc = spawn(CHROMIUM_PATH, [
      `--user-data-dir=${userDataDir}`,
      '--no-sandbox',
      '--disable-gpu',
      '--start-maximized',
      'about:blank'
    ], {
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, DISPLAY: ':1' }
    });

    let stderrOutput = '';

    proc.stderr.on('data', (data) => {
      stderrOutput += data.toString();
    });

    // Check if process dies quickly (crash)
    const exitTimeout = setTimeout(() => {
      console.log('[BROWSER] ✓ Process started successfully');
      resolve(proc);
    }, 1000);

    proc.on('exit', (code, signal) => {
      clearTimeout(exitTimeout);
      if (stderrOutput) {
        console.error('[BROWSER] stderr:', stderrOutput.substring(0, 500));
      }
      reject(new Error(`Browser exited: code ${code}, signal ${signal}`));
    });

    proc.on('error', (err) => {
      clearTimeout(exitTimeout);
      reject(err);
    });
  });
}

async function connectMCP() {
  console.log('[MCP] Connecting to Playwright MCP server...');

  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', '@playwright/mcp@latest', '--no-sandbox'],
    env: {
      ...process.env,
      DISPLAY: ':1',
      PLAYWRITER_AUTO_ENABLE: '1'
    }
  });

  const client = new Client({
    name: 'autoplaywriter',
    version: '1.0.0'
  }, {
    capabilities: {}
  });

  await client.connect(transport);
  console.log('[MCP] ✓ Connected');

  return { client, transport };
}

async function main() {
  console.log('[INIT] Starting Playwright browser with MCP...\n');

  let browserProc = null;
  let client = null;
  let transport = null;

  try {
    // Step 1: Configure extension
    await configureExtension();

    // Step 2: Launch browser
    browserProc = await launchBrowser();

    // Step 3: Give browser time to stabilize
    await new Promise(r => setTimeout(r, 2000));

    // Step 4: Connect MCP
    const mcp = await connectMCP();
    client = mcp.client;
    transport = mcp.transport;

    // Step 5: List tools
    const tools = await client.listTools();
    console.log(`[MCP] ✓ ${tools.tools.length} tools available\n`);

    // Step 6: Navigate
    console.log('[NAV] Navigating to http://localhost...');
    try {
      await client.callTool({
        name: 'browser_navigate',
        arguments: { url: 'http://localhost' }
      });
      console.log('[NAV] ✓ Navigated to localhost\n');
    } catch (err) {
      console.log('[NAV] ⚠ localhost not available, staying on about:blank\n');
    }

    console.log('[READY] ✓ Browser is open and MCP is ready');
    console.log('[READY] Press Ctrl+C to exit\n');

    // Keep running
    await new Promise(() => {});

  } catch (error) {
    console.error('[ERROR]', error.message);

    // Cleanup on error
    if (browserProc && !browserProc.killed) {
      browserProc.kill();
    }
    if (client) {
      await client.close().catch(() => {});
    }

    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGINT', () => {
  console.log('\n[SHUTDOWN] Closing...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[SHUTDOWN] Closing...');
  process.exit(0);
});

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
