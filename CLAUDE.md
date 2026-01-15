# Technical Implementation Notes

## Solution: Persistent Context with Preferences Configuration

The key solution for enabling the Playwriter extension automatically was using Playwright's `launchPersistentContext` with a user data directory and pre-configuring the browser preferences file.

### Why This Works

1. **Persistent User Data**: `launchPersistentContext` saves browser state to `~/.config/chromium/`
2. **Preferences Modification**: Tool creates/modifies `~/.config/chromium/Default/Preferences` to enable extension
3. **Extension Auto-Load**: Chromium reads preferences and loads enabled extensions on startup
4. **No Manual Activation**: Extension is active immediately without user interaction

### Implementation Steps

1. **Pre-configure Preferences**:
   - Read/create `~/.config/chromium/Default/Preferences` JSON file
   - Add extension settings with `active_bit: true`
   - Set `disable_reasons: 0` to ensure extension runs

2. **Launch Persistent Context**:
   - Use `chromium.launchPersistentContext(userDataDir, options)`
   - User data directory points to persistent `~/.config/chromium/`
   - Chromium loads preferences and activates extension

3. **Create Page and Navigate**:
   - Create new page in persistent context
   - Navigate to localhost automatically

### Code Pattern

```javascript
// 1. Enable extension in preferences first
await enablePlaywriterExtension(); // Writes to Preferences file

// 2. Launch browser with persistent context
context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  args: ['--no-sandbox', '--disable-gpu']
});

// 3. Create page and navigate
page = await context.newPage();
await page.goto('http://localhost');
```

## Key Technical Insights

### Extension Preferences Structure

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

### Why NOT to Use MCP Flags

Original attempts used:
- `--load-extension` flag: Doesn't work with npx spawn
- `PLAYWRITER_AUTO_ENABLE=1`: Only works with MCP server, not visible browser
- Playwright MCP server: Headless only, never renders visible window

**Final approach**: Direct Playwright API with persistent preferences = visible + extension active.

### Container Environment

- Display variable (`DISPLAY=:1`) required for X11 rendering
- `--no-sandbox` flag required for containerized Chrome
- Persistent profile saved to user home directory
- Works with Xvnc display server (Kasm environments)

## Verified Functionality

✓ Browser window visible on display
✓ Extension enabled in preferences
✓ Extension active on startup
✓ Navigation to localhost successful
✓ 11 browser processes running (normal)
✓ Persistent profile created in ~/.config/chromium

## Important Files

- `index.js`: Main tool that configures preferences and launches browser
- `~/.config/chromium/Default/Preferences`: Persistent preferences file (auto-created)
- `package.json`: Dependencies include only `@playwright/test`

## Known Limitations

- Requires Playwriter extension to be installed in Chrome (comes with Chrome Web Store)
- Preferences file is human-readable JSON but modified programmatically
- First run creates the preferences directory structure
- HTTP server on localhost required for successful navigation (tool warns if missing)


