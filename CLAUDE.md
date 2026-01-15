# Technical Development Notes

## Key Discoveries and Implementation Decisions

### Critical Insight: Playwright Required for Extension Auto-Connection

**Discovery:** Playwriter extension requires a running Playwright browser instance to auto-connect. Without Playwright launching the browser, the extension cannot establish its MCP connection.

**Solution:** Use `chromium.launch({ headless: false })` from Playwright's test library to spawn the visible browser. The Playwriter extension then automatically connects to this instance.

**Why This Works:**
- Playwright launches the browser process
- The Playwriter Chrome extension runs within that browser
- Extension can directly communicate with the browser via CDP (Chrome DevTools Protocol)
- No separate MCP server needed - extension provides MCP interface directly

### Browser Visibility in Containers

**Requirement:** Display environment variable must be set (defaults to `:1`)

**Container Note:** In Kasm/VNC environments with Xvnc display server, the browser renders to the virtual display accessible via VNC at port 5901.

**Verification:** Browser window confirmed visible in X11 window manager (`wmctrl -l` shows Chromium window).

### Playwright MCP Server vs Direct Playwright

**Attempted:** Using `@playwright/mcp@latest` MCP server with `PLAYWRITER_AUTO_ENABLE=1`

**Problem:** MCP server is headless - it doesn't render a browser window to the display. While MCP tools are available, the browser UI never becomes visible to the user.

**Resolution:** Use Playwright's browser automation API directly instead of MCP server approach. Extension auto-connects to running browser instance.

### Sandbox Requirement

**Flag:** `--no-sandbox` is required for container environments

**Reason:** Chromium sandbox uses kernel capabilities not available in containerized environments. Without this flag, browser launch fails silently.

### localhost Navigation

**Behavior:** Navigation attempt made on startup with graceful error handling

**Error Handling:** If no HTTP server is running, tool warns but continues - allows manual server startup after browser launch

## Final Architecture

```
Tool (node)
  └─→ chromium.launch()  [Playwright]
      └─→ Chromium Browser Process  [visible on display]
          └─→ Playwriter Extension  [auto-connects, provides MCP]
              └─→ MCP Interface  [available to clients]
```

The key difference from initial attempts: We don't try to run an MCP server separately. Instead, Playwright runs the browser directly, the extension runs within it, and the extension itself provides the MCP interface.

## Development Constraints Applied

- ✓ No spawn/exec/fork for orchestration
- ✓ No polling or artificial timing waits
- ✓ All behavior verified through execution
- ✓ No mocks or test fixtures
- ✓ Real browser window confirmed visible on display
- ✓ Real navigation to localhost confirmed working

