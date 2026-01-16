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
[NAV] ✓ Successfully navigated
[READY] Browser automation is ready
```

## What It Does

1. Launches Playwright MCP server via `npx @playwright/mcp@latest`
2. Sets `PLAYWRITER_AUTO_ENABLE=1` environment variable for auto-extension connection
3. Connects to the MCP server using the Model Context Protocol (MCP)
4. Navigates browser to `http://localhost` (with fallback handling)
6. Press `Ctrl+C` to exit gracefully

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
                  └─ 2 Automation Tools
```

The MCP server handles all browser management. No manual Chromium configuration needed.
