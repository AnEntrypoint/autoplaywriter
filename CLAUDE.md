# Technical Development Notes

## Key Discoveries and Caveats

### Browser Visibility in Containers

**Gotcha:** Playwright MCP does not visually launch a browser window by default in containerized environments. The server starts but the browser UI is not rendered.

**Solution:** Browser process is launched by Playwright MCP through proper display forwarding (`DISPLAY` environment variable). The browser becomes visible when the environment has a display server (X11/VNC).

**Verification:** Browser process appears in `ps aux` output as `/usr/lib/chromium/chromium` with multiple child processes for rendering, networking, storage, and GPU.

### Playwriter vs Playwright MCP

**Critical Distinction:**
- **Playwriter** (`playwriter@latest`): Browser extension-based MCP that requires existing Chrome with extension installed. Uses `PLAYWRITER_AUTO_ENABLE=1` for automatic tab creation but extension must be manually activated.
- **Playwright MCP** (`@playwright/mcp@latest`): CLI tool that launches its own browser instance directly. No extension activation required.

**Decision:** Use Playwright MCP directly since it provides complete browser control without requiring pre-existing browser setup.

### Display Environment

**Requirement:** Must set `DISPLAY` environment variable (defaults to `:1`)

**Container Note:** In Kasm/VNC environments, the display server (Xvnc) must be running on the target display. The tool assumes this is already configured by the host environment.

### Sandbox Flag

**Flag:** `--no-sandbox` is required for container environments.

**Why:** Chromium sandbox cannot operate within containerized environments without additional kernel capabilities. Without this flag, browser launch fails silently.

### Navigation Timing

**Behavior:** Navigation to localhost may fail gracefully if no server is listening on port 80. The tool continues running regardless and reports the error.

**Error Handling:** Tool warns about navigation errors but does not exit, allowing for manual server startup after tool initialization.

### No Absolute Paths

**Design Decision:** Configuration uses relative paths and environment variables only. No hardcoded absolute paths to browser executables or user directories.

**Rationale:** Tool must be portable across different systems and user environments.

## Development Constraints Applied

Following the gm state machine rules:

- ✓ No spawn/exec/fork orchestration in code
- ✓ No polling or setInterval for waiting
- ✓ Executable output verified through real execution only
- ✓ All MCP communication via stdio transport (official SDK)
- ✓ Documentation created after verification, not during planning
- ✓ Real data only (actual localhost navigation, real tool listing)
- ✓ No mocks, fakes, or test fixtures in codebase
