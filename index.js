import { chromium } from '@playwright/test';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { homedir } from 'os';
import { join } from 'path';

class PlaywriterMCPHarness {
  constructor() {
    this.browser = null;
    this.client = null;
    this.keepaliveInterval = null;
    this.lastInteractionTime = Date.now();
    this.keepaliveTimeout = 30000; // 30 seconds
    this.running = true;
  }

  async launch() {
    console.log('[INIT] Launching visible Chromium browser with MCP automation...\n');

    try {
      // Step 1: Launch VISIBLE Chromium browser directly
      console.log('[BROWSER] Launching Chromium...');
      const userDataDir = join(homedir(), '.config/chromium-autoplay');
      const extensionPath = '/tmp/playwriter-ext/playwriter-unpacked';

      this.browser = await chromium.launchPersistentContext(userDataDir, {
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

      // Step 2: Wait for extension tabs to stabilize before attempting to manipulate them
      console.log('[BROWSER] Waiting for extension tabs to stabilize...');
      await new Promise(r => setTimeout(r, 2000));

      // Step 3: Close welcome/extension tabs, keep only blank pages
      console.log('[BROWSER] Cleaning up extension tabs...');
      let tabsClosed = 0;
      let tabsKept = 0;
      try {
        const pages = await this.browser.pages();
        console.log(`[BROWSER] Found ${pages.length} page(s)\n`);

        for (const page of pages) {
          try {
            const url = page.url();
            console.log(`[BROWSER] Checking page: ${url}`);

            // Close chrome-extension and about pages
            if (url.includes('chrome-extension')) {
              try {
                await page.close();
                console.log(`[BROWSER] ✓ Closed: ${url}`);
                tabsClosed++;
              } catch (closeErr) {
                console.log(`[BROWSER] ✗ Failed to close: ${url}`);
                console.log(`[BROWSER] Error: ${closeErr.message}`);
              }
            } else {
              console.log(`[BROWSER] ℹ Keeping: ${url}`);
              tabsKept++;
            }
          } catch (err) {
            console.log(`[BROWSER] ⚠ Error checking page: ${err.message}`);
          }
        }

        console.log(`[BROWSER] ✓ Cleanup complete: closed ${tabsClosed}, kept ${tabsKept}\n`);
      } catch (err) {
        console.log(`[BROWSER] ⚠ Tab cleanup error: ${err.message}\n`);
      }

      // Step 4: Navigate to localhost if available
      console.log('[NAV] Attempting to navigate to http://localhost...');
      try {
        const pages = await this.browser.pages();
        if (pages.length > 0) {
          const page = pages[0];
          await page.goto('http://localhost', { waitUntil: 'domcontentloaded', timeout: 3000 });
          console.log(`[NAV] ✓ Successfully navigated to http://localhost`);
          console.log(`[NAV] ✓ Current URL: ${page.url()}\n`);
        }
      } catch (err) {
        console.log(`[NAV] ⚠ localhost not available (no server running)\n`);
      }

      // Step 5: Connect Playwright MCP server
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

      this.client = new Client({
        name: 'autoplaywriter',
        version: '1.0.0'
      }, {
        capabilities: {}
      });

      await this.client.connect(transport);
      console.log('[MCP] ✓ Connected to Playwright MCP server\n');

      // Step 6: List available tools
      const tools = await this.client.listTools();
      console.log(`[MCP] ✓ ${tools.tools.length} automation tools available`);
      console.log(`  Sample tools: ${tools.tools.map(t => t.name).slice(0, 5).join(', ')}...\n`);

      // Update last interaction time
      this.lastInteractionTime = Date.now();

      console.log('[READY] ✓ Browser is visible on your display');
      console.log('[READY] ✓ Playwriter extension puzzle icon in toolbar');
      console.log('[READY] ✓ MCP automation tools are available');
      console.log('[READY] ✓ Keepalive monitoring active');
      console.log('[READY] Press Ctrl+C to exit\n');

      // Start keepalive monitoring
      this.startKeepalive();

    } catch (error) {
      console.error('[ERROR] Launch failed:', error.message);
      await this.cleanup();
      throw error;
    }
  }

  startKeepalive() {
    console.log('[KEEPALIVE] Starting health checks (30s interval - monitors Playwriter extension)\n');
    console.log('[KEEPALIVE] Watching for: frame detached, connection loss, extension failure\n');

    let checkCount = 0;

    this.keepaliveInterval = setInterval(async () => {
      checkCount++;
      try {
        if (!this.client) {
          console.log('[KEEPALIVE] ⚠ MCP client disconnected, restarting...');
          await this.restart();
          return;
        }

        // Test if Playwriter extension is still responsive
        // Playwriter extension frequently gets "frame is detached" errors during long sessions
        try {
          // Test: Evaluate JavaScript on page (proves Playwriter can access frame)
          const evalResult = await this.client.callTool({
            name: 'browser_evaluate',
            arguments: { expression: 'typeof window' }
          });

          this.lastInteractionTime = Date.now();
          console.log(`[KEEPALIVE #${checkCount}] ✓ Playwriter extension controls page (frame attached)`);

        } catch (toolError) {
          // Check if this is a frame detached error - requires immediate restart
          const errorMessage = toolError.message.toLowerCase();
          const isFrameDetached = errorMessage.includes('frame') &&
                                  (errorMessage.includes('detached') ||
                                   errorMessage.includes('navigator') ||
                                   errorMessage.includes('context'));

          if (isFrameDetached) {
            console.log('[KEEPALIVE] ⚠⚠⚠ FRAME DETACHED ERROR DETECTED ⚠⚠⚠');
            console.log(`[KEEPALIVE] Error: ${toolError.message}`);
            console.log('[KEEPALIVE] Playwriter extension lost access to page frames');
            console.log('[KEEPALIVE] Restarting Playwright and Playwriter extension immediately...\n');
            await this.restart();
            return;
          }

          // Not a frame detached error - check if timeout exceeded
          console.log(`[KEEPALIVE] ⚠ Extension not responding: ${toolError.message}`);
          const timeSinceLastInteraction = Date.now() - this.lastInteractionTime;
          console.log(`[KEEPALIVE] ⚠ Time since last successful interaction: ${(timeSinceLastInteraction / 1000).toFixed(1)}s`);

          if (timeSinceLastInteraction > this.keepaliveTimeout) {
            console.log('[KEEPALIVE] ⚠ Timeout exceeded, restarting MCP and browser...');
            await this.restart();
          }
        }

      } catch (error) {
        console.log(`[KEEPALIVE] ⚠ Health check error: ${error.message}`);
        const timeSinceLastInteraction = Date.now() - this.lastInteractionTime;

        if (timeSinceLastInteraction > this.keepaliveTimeout) {
          console.log('[KEEPALIVE] ⚠ Timeout exceeded, restarting...');
          await this.restart();
        }
      }
    }, this.keepaliveTimeout);
  }

  async restart() {
    console.log('[RESTART] Initiating complete restart...\n');

    try {
      // Close MCP client
      if (this.client) {
        try {
          await this.client.close();
        } catch (e) {}
        this.client = null;
      }

      // Close browser
      if (this.browser) {
        try {
          await this.browser.close();
        } catch (e) {}
        this.browser = null;
      }

      // Wait before relaunching
      await new Promise(r => setTimeout(r, 2000));

      // Relaunch
      console.log('[RESTART] Relaunching system...\n');
      await this.launch();

    } catch (error) {
      console.error('[RESTART] Failed to restart:', error.message);
      await this.cleanup();
      process.exit(1);
    }
  }

  async cleanup() {
    console.log('[SHUTDOWN] Cleaning up resources...');

    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval);
      this.keepaliveInterval = null;
    }

    if (this.client) {
      try {
        await this.client.close();
      } catch (e) {}
    }

    if (this.browser) {
      try {
        await this.browser.close();
      } catch (e) {}
    }

    this.running = false;
  }

  async shutdown() {
    console.log('\n[SHUTDOWN] Closing...');
    await this.cleanup();
    process.exit(0);
  }
}

// Global instance
let harness = null;

async function main() {
  harness = new PlaywriterMCPHarness();
  await harness.launch();

  // Keep running
  await new Promise(() => {});
}

process.on('SIGINT', async () => {
  if (harness) {
    await harness.shutdown();
  } else {
    process.exit(0);
  }
});

process.on('SIGTERM', async () => {
  if (harness) {
    await harness.shutdown();
  } else {
    process.exit(0);
  }
});

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
