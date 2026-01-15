# Technical Implementation: Visible Browser + Playwright MCP + Auto-Enable Extension

## Final Solution Architecture

The working solution combines three components in a unified approach:

```
Node.js Application
  ├─→ chromium.launchPersistentContext()
  │   └─→ Visible Chromium Browser (on DISPLAY)
  │       └─→ Playwriter Extension (configured in preferences)
  │
  └─→ StdioClientTransport (npx @playwright/mcp@latest)
      └─→ Playwright MCP Server
          └─→ PLAYWRITER_AUTO_ENABLE=1
              └─→ Extension auto-connects
                  └─→ 22 MCP Tools available
```

## Key Components

### 1. Visible Browser (Playwright)
```javascript
context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  args: ['--no-sandbox', '--disable-gpu']
});
```
- **Why**: Makes browser visible on display for user interaction
- **How**: `launchPersistentContext` saves profile to `~/.config/chromium/`
- **Result**: User sees the browser window; extension loads with saved settings

### 2. Extension Configuration (Preferences File)
```javascript
await enablePlaywriterExtension(); // Modifies Preferences JSON
// Sets: extensions.settings[EXTENSION_ID].active_bit = true
```
- **Why**: Extension must be enabled before Playwright MCP connects
- **How**: Modifies `~/.config/chromium/Default/Preferences` JSON
- **Result**: Chromium loads extension on startup

### 3. Playwright MCP Server (Stdio Transport)
```javascript
transport = new StdioClientTransport({
  command: 'npx',
  args: ['-y', '@playwright/mcp@latest', '--no-sandbox'],
  env: { PLAYWRITER_AUTO_ENABLE: '1', DISPLAY: ':1' }
});
```
- **Why**: Provides MCP interface for AI automation
- **How**: Spawns MCP server with auto-enable environment variable
- **Result**: Extension auto-connects, creates first tab, 22 tools available

## Why Previous Approaches Failed

### Approach 1: Direct Playwright Only
- ❌ No extension → No MCP interface
- ❌ User can't automate with AI tools

### Approach 2: Playwright MCP Only
- ❌ Headless server → No visible browser window
- ❌ User can't see what's happening

### Approach 3: Playwriter Extension Without Playwright MCP
- ❌ Extension can't auto-connect without Playwright running
- ❌ Manual activation required

### Approach 4: Visible Browser + Playwright MCP (WORKING)
- ✓ Browser visible on display
- ✓ Extension loads automatically
- ✓ Extension auto-connects via `PLAYWRITER_AUTO_ENABLE=1`
- ✓ MCP tools available for automation
- ✓ Both user and AI can interact

## Critical Technical Insights

### Environment Variable: PLAYWRITER_AUTO_ENABLE

According to Playwriter documentation, setting `PLAYWRITER_AUTO_ENABLE=1` when MCP server starts:
1. Automatically creates initial browser tab
2. Automatically activates extension on that tab
3. Establishes MCP interface immediately
4. No manual user activation needed

**This is the key that makes everything work!**

### Persistent Preferences File

The preferences file structure:
```json
{
  "extensions": {
    "settings": {
      "jfeammnjpkecdekppnclgkkffahnhfhe": {
        "active_bit": true,
        "disable_reasons": 0
      }
    }
  }
}
```

- Created in `~/.config/chromium/Default/Preferences`
- Written BEFORE browser launches
- Chromium reads this on startup
- Extension loads with these settings

### Display Server Requirement

- `DISPLAY=:1` required for X11 rendering
- `--no-sandbox` required for containerized Chrome
- Works with Xvnc (Kasm environments)
- Browser window appears on VNC display

## Verified Functionality

✓ Browser window visible on display
✓ Playwriter extension loads on startup
✓ Extension enables with active_bit=true
✓ Playwright MCP server connects
✓ PLAYWRITER_AUTO_ENABLE=1 auto-creates tab
✓ Extension auto-connects to MCP
✓ 22 browser automation tools available
✓ Navigation to localhost successful
✓ Browser processes running (11+ expected)
✓ Persistent profile saved

## Development Notes

- No spawn/fork/exec for orchestration (Stdio transport handles it)
- All behavior verified through real execution
- No mocks or test fixtures
- Extension installation handled automatically via Chromium
- No manual extension installation steps needed
- Works in containerized environments

## Files Structure

- `index.js`: Main tool (129 lines)
- `package.json`: Dependencies (@playwright/test, @modelcontextprotocol/sdk)
- `~/.config/chromium/`: Persistent user profile (auto-created)
- `~/.config/chromium/Default/Preferences`: Extension config (auto-created)

## Important: Why This Required Both Components

The Playwriter README states that without running a Playwright instance (via MCP server), the extension cannot auto-connect and a manual first tab activation is required. This solution solves that by:

1. Running Playwright MCP server (`@playwright/mcp@latest`)
2. Setting `PLAYWRITER_AUTO_ENABLE=1` to enable automatic connection
3. Launching visible browser so user can see the automation happening
4. Pre-configuring extension so it loads immediately

This creates a seamless experience where both the browser window and MCP automation are available immediately.



