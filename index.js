import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

async function main() {
  console.log('[INIT] Starting Playwright MCP browser automation...');

  // Set environment for display
  const env = { ...process.env };
  env.DISPLAY = env.DISPLAY || ':1';

  try {
    console.log('[TRANSPORT] Creating stdio transport for Playwright MCP...');
    const transport = new StdioClientTransport({
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest', '--no-sandbox'],
      env
    });

    // Log stderr from server for debugging
    transport.process?.stderr?.on('data', (data) => {
      console.error('[PLAYWRIGHT STDERR]', data.toString());
    });

    console.log('[CLIENT] Creating MCP client...');
    const client = new Client({
      name: 'playwright-control',
      version: '1.0.0'
    }, {
      capabilities: {}
    });

    console.log('[CONNECT] Connecting to Playwright MCP server...');
    await client.connect(transport);

    console.log('[CONNECTED] Successfully connected to Playwright MCP server');

    // List available tools
    console.log('[TOOLS] Listing available tools...');
    const toolsList = await client.listTools();
    console.log(`[TOOLS] Found ${toolsList.tools.length} tools:`);
    toolsList.tools.forEach(tool => {
      console.log(`  - ${tool.name}`);
    });

    // Navigate to localhost
    console.log('[NAV] Navigating browser to localhost...');
    try {
      const navResult = await client.callTool({
        name: 'browser_navigate',
        arguments: {
          url: 'http://localhost'
        }
      });

      console.log('[NAV] Navigation successful');
    } catch (err) {
      console.warn('[NAV] Navigation error (may be expected if localhost not running):', err.message);
    }

    console.log('[READY] Browser automation ready!');
    console.log('[READY] Browser is open and available for automation');
    console.log('[READY] Press Ctrl+C to close');

    // Keep running
    await new Promise(() => {});

  } catch (error) {
    console.error('[ERROR] Failed to start:', error.message);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
