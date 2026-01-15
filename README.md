# Autoplaywriter

Browser automation tool that launches Chromium and automatically navigates to localhost. The Playwriter extension is automatically enabled for MCP interface access.

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
2. Launch Chromium browser in headed mode (visible window)
3. Create a new browser page
4. Automatically navigate to `http://localhost`
5. Keep the browser running with extension active

## How It Works

The tool uses Playwright's `launchPersistentContext` API to:
- Launch a visible Chromium browser with persistent user data directory
- Pre-configure the Chromium preferences to enable the Playwriter extension
- Create a new page and navigate to localhost
- Keep the browser running for continuous interaction

The Playwriter extension (if installed in Chrome) will automatically be active and provide MCP interface capabilities to interact with the browser via AI assistants.

## Extension Configuration

The tool automatically:
- Creates/modifies `~/.config/chromium/Default/Preferences`
- Enables Playwriter extension ID: `jfeammnjpkecdekppnclgkkffahnhfhe`
- Sets `active_bit: true` so extension is active on startup
- Sets `disable_reasons: 0` to ensure extension runs

## Environment

- Display: Uses `DISPLAY` environment variable (defaults to `:1`)
- Sandbox: Disabled via `--no-sandbox` flag for container compatibility
- Browser: Chromium in headed (visible) mode with persistent profile

## Requirements

- Playwriter extension installed in Chrome/Chromium
- HTTP server running on `http://localhost` (optional, tool will warn if missing)

## Deployed

Published to: https://github.com/AnEntrypoint/autoplaywriter



