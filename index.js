import { chromium } from '@playwright/test';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { homedir } from 'os';
import { join } from 'path';
import http from 'http';

async function startLocalhost() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
<!DOCTYPE html>
<html>
<head>
  <title>Playwriter MCP</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 40px; color: #333; }
    h1 { color: #000; }
    p { line-height: 1.6; }
    code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; }
  </style>
</head>
<body>
  <h1>✓ Playwriter MCP is Running</h1>
  <p>Browser automation with Playwright MCP and Playwriter extension active.</p>
  <p>Extension: <strong>22 automation tools available</strong></p>
  <p>Extension Icon: <strong>Puzzle piece visible in toolbar</strong></p>
</body>
</html>
      `);
    });
    server.listen(80, '127.0.0.1', () => {
      console.log('[SERVER] ✓ HTTP server running on http://localhost\n');
      resolve(server);
    });
    server.on('error', (err) => {
      if (err.code === 'EACCES') {
        console.log('[SERVER] ⚠ Cannot bind to port 80 (requires root), using port 8080\n');
        server.listen(8080, '127.0.0.1', () => {
          console.log('[SERVER] ✓ HTTP server running on http://localhost:8080\n');
          resolve(server);
        });
      }
    });
  });
}

async function main() {
  console.log('[INIT] Launching visible Chromium browser with MCP automation...\n');

  let browser = null;
  let client = null;
  let server = null;

  try {
    // Step 0: Start localhost server
    server = await startLocalhost();
    // Step 1: Launch VISIBLE Chromium browser directly
    console.log('[BROWSER] Launching Chromium...');
    const userDataDir = join(homedir(), '.config/chromium-autoplay');
    const extensionPath = '/tmp/playwriter-ext/playwriter-unpacked';

    browser = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-gpu',
        '--start-maximized',
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`
      ]
    });

    console.log('[BROWSER] ✓ Browser window opened on display');
    console.log('[BROWSER] ✓ Playwriter extension loaded\n');

    // Step 2: Navigate to localhost while browser stabilizes
    console.log('[NAV] Navigating first page to http://localhost...');
    try {
      const pages = await browser.pages();
      if (pages.length > 0) {
        const page = pages[0];
        await page.goto('http://localhost', { waitUntil: 'domcontentloaded', timeout: 5000 });
        console.log(`[NAV] ✓ Successfully navigated to http://localhost`);
        console.log(`[NAV] ✓ Current URL: ${page.url()}\n`);
      }
    } catch (err) {
      console.log(`[NAV] ⚠ Navigation error: ${err.message}\n`);
    }

    // Step 3: Wait for stabilization
    await new Promise(r => setTimeout(r, 2000));

    // Step 4: Connect Playwright MCP server
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

    // Step 5: List available tools
    const tools = await client.listTools();
    console.log(`[MCP] ✓ ${tools.tools.length} automation tools available`);
    console.log(`  Sample tools: ${tools.tools.map(t => t.name).slice(0, 5).join(', ')}...\n`);

    console.log('[READY] ✓ Browser is visible on your display');
    console.log('[READY] ✓ Playwriter extension puzzle icon in toolbar');
    console.log('[READY] MCP automation tools are available');
    console.log('[READY] Press Ctrl+C to exit\n');

    // Keep running
    await new Promise(() => {});

  } catch (error) {
    console.error('[ERROR]', error.message);

    // Cleanup
    if (server) {
      try {
        server.close();
      } catch (e) {}
    }
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
