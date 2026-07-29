# Upgrading Producer Pal

When installing a new version of Producer Pal, follow these steps:

## 1. Download New Files

Get the latest version (v{{ $frontmatter.version }}) —
[what's new?](https://github.com/adamjmurray/producer-pal/releases/latest):

- [Producer_Pal.amxd](https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.amxd) -
  Max for Live device
- [Producer_Pal.mcpb](https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.mcpb) -
  Claude Desktop extension (if applicable)

## 2. Replace the Max Device

Replace `Producer_Pal.amxd` in the location where you originally saved it (e.g.
in your Live User Library). Live projects referencing this location will
automatically use the new version.

**Exception:** If you saved projects with "Collect All and Save" (with device
files included), those have their own copy of Producer Pal. For those projects,
drag the new `.amxd` into Live to replace the old version.

Check the version number in the device UI to confirm you're running the latest
version.

::: tip Your project context carries over

Project context is backed up next to each Set's `.als` and restored
automatically on the new device — see
[the rare exception](/support/known-issues#recent-project-context-can-be-lost-on-a-device-upgrade-rare)
if you changed it right before a first save.

:::

## 3. Update Platform-Specific Files

### For Claude Desktop Users

1. Go to Settings → Extensions
2. Click the `...` menu on the old Producer Pal extension and select "Uninstall"
3. Install the new `Producer_Pal.mcpb` file (see
   [Claude Desktop installation](./claude-desktop))

### For Other Setups

- **Using `npx producer-pal`:** `npx` usually fetches the latest version
  automatically, so no action is needed. But it can also serve a **stale cached
  copy** — or skip fetching entirely if you once ran
  `npm install -g producer-pal` (it runs your global copy instead). If Producer
  Pal stops working after an upgrade — often with a misleading error like
  "cannot connect to MCP server" — force the latest version:

  ```bash
  npm install -g producer-pal@latest
  ```

  Then restart your AI app. See
  [`npx` is running an old version](/support/troubleshooting#npx-is-running-an-old-version)
  for details.

## 4. Restart Your AI App

Restart your AI application to ensure it picks up the changes.

## Troubleshooting After Upgrade

If Producer Pal stops working after upgrading:

- **Claude Desktop users:** Make sure you uninstalled the old extension before
  installing the new one
- **All users:** Verify you replaced the `.amxd` device (and the `.mcpb`
  extension if applicable)
- Try deleting and re-adding the Producer Pal device in Ableton Live
- Restart your AI app completely
- Start a fresh conversation

See the [Troubleshooting Guide](/support/troubleshooting) for more help.

## Version History

See the full
[release history](https://github.com/adamjmurray/producer-pal/releases) on
GitHub.
