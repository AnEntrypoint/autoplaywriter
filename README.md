# Autoplaywriter

Browser automation tool that launches Chromium and automatically navigates to localhost.

## Installation

```bash
npm install
```

## Usage

```bash
npm start
```

The tool will:
1. Launch Chromium browser on the default display
2. Create a browser context and page
3. Automatically navigate to `http://localhost`
4. Keep the browser open and ready for interaction

## How It Works

The tool uses Playwright's `@playwright/test` API to:
- Launch a visible Chromium browser instance
- Create a new context and page
- Navigate to the specified URL
- Keep the process running for continuous interaction

## Environment

- Display: Uses `DISPLAY` environment variable (defaults to `:1`)
- Sandbox: Disabled via `--no-sandbox` flag for container compatibility
- Browser: Chromium in headed (visible) mode

## Deployed

Published to: https://github.com/AnEntrypoint/autoplaywriter

