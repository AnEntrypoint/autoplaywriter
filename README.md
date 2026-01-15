# Autoplaywriter

Browser automation tool that launches Chromium and automatically navigates to localhost. The Playwriter extension can auto-connect to the running browser instance.

## Installation

```bash
npm install
```

## Usage

```bash
npm start
```

The tool will:
1. Launch Chromium browser in headed mode (visible window)
2. Create a browser context and page
3. Automatically navigate to `http://localhost`
4. Keep the browser running ready for automation
5. Enable Playwriter extension to auto-connect if installed

## How It Works

The tool uses Playwright's `@playwright/test` API to:
- Launch a visible Chromium browser instance on the default display
- Create a new context and page
- Navigate to the specified URL
- Keep the process running

The Playwriter Chrome extension (if installed) will automatically connect to the running Playwright browser instance, providing additional automation capabilities via its MCP interface.

## Environment

- Display: Uses `DISPLAY` environment variable (defaults to `:1`)
- Sandbox: Disabled via `--no-sandbox` flag for container compatibility
- Browser: Chromium in headed (visible) mode

## Requirements

- Playwriter extension installed in Chrome/Chromium (optional, for auto-connection)
- HTTP server running on `http://localhost` (tool will warn if not available)

## Deployed

Published to: https://github.com/AnEntrypoint/autoplaywriter


