import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

async function main() {
  console.log('[INIT] Starting Playwright MCP with auto-enabled Playwriter extension...\n');

  let client = null;
  let transport = null;

  try {
    // Connect to Playwright MCP server
    console.log('[MCP] Launching Playwright MCP server...');
    transport = new StdioClientTransport({
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

    // List available tools
    const tools = await client.listTools();
    console.log(`[MCP] ✓ ${tools.tools.length} automation tools available`);
    console.log(`  Tools: ${tools.tools.map(t => t.name).slice(0, 5).join(', ')}...\n`);

    // Navigate to localhost
    console.log('[NAV] Navigating to http://localhost...');
    try {
      await client.callTool({
        name: 'browser_navigate',
        arguments: { url: 'http://localhost' }
      });
      console.log('[NAV] ✓ Successfully navigated\n');
    } catch (err) {
      console.log('[NAV] ⚠ Navigation failed (localhost may not be running)');
      console.log('[NAV] Browser is still available for automation\n');
    }

    console.log('[READY] ✓ Browser automation is ready');
    console.log('[READY] Playwriter extension is active and auto-connected');
    console.log('[READY] MCP tools are available for browser control');
    console.log('[READY] Press Ctrl+C to exit\n');

    // Keep running indefinitely
    await new Promise(() => {});

  } catch (error) {
    console.error('[ERROR]', error.message);

    // Cleanup on error
    if (client) {
      await client.close().catch(() => {});
    }

    process.exit(1);
  }
}

// Handle shutdown signals gracefully
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
