# Autoplaywriter

Simple tool that connects to Playwright MCP server with auto-enabled Playwriter extension for browser automation.

## Installation

```bash
npm install
```

## Usage

```bash
npm start
```

Output:
```
[INIT] Starting Playwright MCP with auto-enabled Playwriter extension...
[MCP] ✓ Connected to Playwright MCP server
[MCP] ✓ 22 automation tools available
[NAV] ✓ Successfully navigated
[READY] Browser automation is ready
```

## What It Does

1. Launches Playwright MCP server via `npx @playwright/mcp@latest`
2. Sets `PLAYWRITER_AUTO_ENABLE=1` environment variable for auto-extension connection
3. Connects to the MCP server using the Model Context Protocol (MCP)
4. Navigates browser to `http://localhost` (with fallback handling)
5. Keeps session active - 22 browser automation tools available
6. Press `Ctrl+C` to exit gracefully

## Browser Automation Tools

Available via the MCP interface:
- `browser_navigate` - Navigate to URLs
- `browser_click` - Click elements
- `browser_fill_form` - Fill form fields
- `browser_type` - Type text
- `browser_take_screenshot` - Capture screenshots
- `browser_evaluate` - Run JavaScript
- `browser_console_messages` - Read browser console
- And 15 more tools...

## Environment

- `DISPLAY=:1` - X11 display for rendering
- `PLAYWRITER_AUTO_ENABLE=1` - Enables Playwriter extension auto-connect
- `--no-sandbox` - Required for containerized Chromium

## Architecture

```
Node.js App
  └─ StdioClientTransport
      └─ @playwright/mcp@latest (MCP Server)
          └─ Chromium Browser
              └─ Playwriter Extension (auto-enabled)
                  └─ 22 Automation Tools
```

The MCP server handles all browser management. No manual Chromium configuration needed.
