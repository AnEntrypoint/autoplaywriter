import { resolve } from 'path';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

async function main() {
  console.log('[INIT] Starting Playwright MCP client...');

  // Set environment for display
  const env = { ...process.env };
  env.DISPLAY = env.DISPLAY || ':1';

  // Path to chromium executable
  const chromeExePath = resolve(
    process.env.HOME || '/root',
    '.cache/ms-playwright/chromium-1200/chrome-linux/chrome'
  );

  // Note: Playwriter MCP extension (jfeammnjpkecdekppnclgkkffahnhfhe) can be installed separately
  // for browser extension integration, but is not required for basic browser control.

  try {
    console.log('[TRANSPORT] Creating stdio transport...');
    const transport = new StdioClientTransport({
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest', '--browser', 'chromium', '--executable-path', chromeExePath, '--no-sandbox'],
      env
    });

    // Log stderr from server for debugging
    transport.process?.stderr?.on('data', (data) => {
      console.error('[MCP STDERR]', data.toString());
    });

    console.log('[CLIENT] Creating MCP client...');
    const client = new Client({
      name: 'playwright-control',
      version: '1.0.0'
    }, {
      capabilities: {}
    });

    console.log('[CONNECT] Connecting to server...');
    await client.connect(transport);

    console.log('[CONNECTED] Successfully connected to Playwright MCP server');

    // List available tools
    console.log('[TOOLS] Listing available tools...');
    const toolsList = await client.listTools();
    console.log(`[TOOLS] Found ${toolsList.tools.length} tools:`);
    toolsList.tools.forEach(tool => {
      console.log(`  - ${tool.name}: ${tool.description}`);
    });

    // Find browser_navigate tool
    const navigateTool = toolsList.tools.find(t => t.name === 'browser_navigate');
    if (!navigateTool) {
      throw new Error('browser_navigate tool not found!');
    }

    console.log('[NAV] Calling browser_navigate to open browser...');
    const navResult = await client.callTool({
      name: 'browser_navigate',
      arguments: { url: 'http://localhost' }
    });

    console.log('[NAV] Navigation result:', navResult);

    // Wait a moment for browser to load
    await new Promise(r => setTimeout(r, 2000));

    // Try to get a snapshot
    console.log('[SNAPSHOT] Requesting page snapshot...');
    try {
      const snapshotResult = await client.callTool({
        name: 'browser_snapshot',
        arguments: {}
      });
      console.log('[SNAPSHOT] Browser is displaying page');
      console.log('[SNAPSHOT] Snapshot content preview:',
        JSON.stringify(snapshotResult).substring(0, 500) + '...');
    } catch (err) {
      console.warn('[SNAPSHOT] Could not get snapshot:', err.message);
    }

    console.log('[READY] Browser control established!');
    console.log('[READY] Browser window should be visible on your display');
    console.log('[READY] Press Ctrl+C to close');

    // Keep running
    await new Promise(() => {});

  } catch (error) {
    console.error('[ERROR] Failed to connect or operate:', error.message);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
