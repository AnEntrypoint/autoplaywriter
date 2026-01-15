# Autoplaywriter

Browser automation tool that launches Chromium and Playwright MCP server with Playwriter extension auto-enabled.

## Installation

```bash
npm install
```

## Usage

```bash
npm start
```

The tool will:
1. Configure Playwriter extension in Chromium preferences
2. Launch visible Chromium browser with persistent profile
3. Spawn Playwright MCP server with `PLAYWRITER_AUTO_ENABLE=1`
4. Playwriter extension auto-connects and creates initial tab
5. Automatically navigate to `http://localhost`
6. Keep both browser and MCP server running

## How It Works

The tool combines three key components:

### 1. Visible Chromium Browser
- Uses `chromium.launchPersistentContext()` to launch visible browser
- Saves profile to `~/.config/chromium/` for persistence
- Browser window appears on the display

### 2. Playwriter Extension Configuration
- Registers extension at system level: `/opt/google/chrome/extensions/{ID}.json`
- Pre-configures `~/.config/chromium/Default/Preferences`
- Enables extension ID: `jfeammnjpkecdekppnclgkkffahnhfhe`
- Sets `active_bit: true` so extension loads on startup
- System-level registration allows Chromium to discover and auto-install from Chrome Web Store
- Extension provides MCP interface for AI automation

### 3. Playwright MCP Server
- Spawned via `npx @playwright/mcp@latest`
- Environment variable `PLAYWRITER_AUTO_ENABLE=1` enables:
  - Automatic browser tab creation
  - Automatic extension connection
  - MCP interface availability
- Exposes 22 browser automation tools

## Automation Capabilities

Once running, you can:
- Control the browser via Playwright MCP tools
- Interact with pages programmatically
- Automate clicks, form fills, navigation
- Take screenshots, extract data
- All via the Playwriter extension's MCP interface

## Environment

- Display: Uses `DISPLAY` environment variable (defaults to `:1`)
- Sandbox: Disabled via `--no-sandbox` flag for container compatibility
- Browser: Chromium in headed (visible) mode
- Profile: Persistent at `~/.config/chromium/`

## Requirements

- Display server running (X11/Xvnc for visible window)
- HTTP server on `http://localhost` (optional, tool warns if missing)
- `chromeextensioninstaller` tool available for extension registration
  - Installed automatically via `npx -y gxe@latest AnEntrypoint/chromeextensioninstaller`
  - This is essential for Chromium to discover and load the extension

## Deployed

Published to: https://github.com/AnEntrypoint/autoplaywriter




