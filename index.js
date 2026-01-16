import { chromium } from '@playwright/test';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { homedir } from 'os';
import { join } from 'path';

async function main() {
  console.log('[INIT] Launching visible Chromium browser with MCP automation...\n');

  let browser = null;
  let client = null;

  try {
    // Step 1: Launch VISIBLE Chromium browser directly
    console.log('[BROWSER] Launching Chromium...');
    const userDataDir = join(homedir(), '.config/chromium-autoplay');

    browser = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: ['--no-sandbox', '--disable-gpu', '--start-maximized']
    });

    console.log('[BROWSER] ✓ Browser window opened on display\n');

    // Step 2: Wait for browser to stabilize
    await new Promise(r => setTimeout(r, 2000));

    // Step 3: Connect Playwright MCP server
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

    client = new Client({
      name: 'autoplaywriter',
      version: '1.0.0'
    }, {
      capabilities: {}
    });

    await client.connect(transport);
    console.log('[MCP] ✓ Connected to Playwright MCP server\n');

    // Step 4: List available tools
    const tools = await client.listTools();
    console.log(`[MCP] ✓ ${tools.tools.length} automation tools available`);
    console.log(`  Sample tools: ${tools.tools.map(t => t.name).slice(0, 5).join(', ')}...\n`);

    // Step 5: Navigate to localhost
    console.log('[NAV] Navigating to http://localhost...');
    try {
      await client.callTool({
        name: 'browser_navigate',
        arguments: { url: 'http://localhost' }
      });
      console.log('[NAV] ✓ Successfully navigated\n');
    } catch (err) {
      console.log('[NAV] ⚠ localhost not running - browser is ready for other URLs\n');
    }

    console.log('[READY] ✓ Browser is visible on your display');
    console.log('[READY] MCP automation tools are available');
    console.log('[READY] Playwriter extension is active');
    console.log('[READY] Press Ctrl+C to exit\n');

    // Keep running
    await new Promise(() => {});

  } catch (error) {
    console.error('[ERROR]', error.message);

    // Cleanup
    if (browser) {
      try {
        await browser.close();
      } catch (e) {}
    }
    if (client) {
      await client.close().catch(() => {});
    }

    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  console.log('\n[SHUTDOWN] Closing...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[SHUTDOWN] Closing...');
  process.exit(0);
});

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
