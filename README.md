# Autoplaywriter

## Technical Caveats

- Extension folder `extension/` contains Playwright MCP Bridge v0.0.56 from microsoft/playwright-mcp
- Extension ID `jakfalbnbhgkpmoaakfflhflbfpkailf` is hardcoded in MCP server (cdpRelay.js:81)
- Extension ID derived from `key` field in manifest.json - do not modify
- Must load extension via `--load-extension` flag, not Chrome Web Store
- User data persists to `~/.config/chromium-autoplay`
- "Frame detached" errors require full browser restart (handled by keepalive)
