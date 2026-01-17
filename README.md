# Autoplaywriter

## Technical Caveats

- Extension folder `extension/` contains Playwriter MCP v0.0.66 from remorses/playwriter
- Extension ID `jfeammnjpkecdekppnclgkkffahnhfhe` derived from `key` field in manifest.json
- Chrome policy `/etc/chromium/policies/managed/extension_allowlist.json` must allowlist this ID
- Extension connects to relay server at `ws://127.0.0.1:${PLAYWRITER_PORT}/extension`
- User data persists to `~/.config/chromium-autoplay`
