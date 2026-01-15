# Autoplaywriter

Browser automation via Playwright MCP with automatic localhost navigation.

## Installation

```bash
npm install
```

## Usage

```bash
npm start
```

The tool will:
1. Launch Playwright MCP server
2. Spawn a browser instance on the default display
3. Automatically navigate to `http://localhost`
4. Expose 22 Playwright browser automation tools via MCP protocol

## How It Works

The tool uses the Model Context Protocol (MCP) to spawn an `@playwright/mcp` server, which automatically launches a Chromium browser and provides tools for browser automation including:

- `browser_navigate` - Navigate to URLs
- `browser_click` - Click elements
- `browser_take_screenshot` - Capture screen
- `browser_evaluate` - Run JavaScript
- `browser_snapshot` - Get page structure
- And 17 additional tools

The browser navigates to `http://localhost` by default on startup.

## Environment

- Display: Uses `DISPLAY` environment variable (defaults to `:1`)
- Sandbox: Disabled via `--no-sandbox` flag for container compatibility
- MCP SDK: Uses official `@modelcontextprotocol/sdk` for protocol conformance

## Deployed

Published to: https://github.com/AnEntrypoint/autoplaywriter

## Technical Details

The implementation connects to Playwright MCP via stdio transport, providing a clean MCP client interface for browser automation without requiring manual browser management.
