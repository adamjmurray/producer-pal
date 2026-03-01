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

## 3. Update Platform-Specific Files

### For Claude Desktop Users

1. Go to Settings → Extensions
2. Click the `...` menu on the old Producer Pal extension and select "Uninstall"
3. Install the new `Producer_Pal.mcpb` file (see
   [Claude Desktop installation](./claude-desktop))

### For Other Setups

- **Using `npx producer-pal`:** Updates are fetched automatically (no action
  needed)
- **Downloaded `producer-pal-portal.js`:** Replace it with the
  [latest version](https://github.com/adamjmurray/producer-pal/releases/latest/download/producer-pal-portal.js)
  at the same file path

## 4. Restart Your AI App

Restart your AI application to ensure it picks up the changes.

## Troubleshooting After Upgrade

If Producer Pal stops working after upgrading:

- **Claude Desktop users:** Make sure you uninstalled the old extension before
  installing the new one
- **All users:** Verify you replaced both the `.amxd` device AND the portal/mcpb
  files (if applicable)
- Try deleting and re-adding the Producer Pal device in Ableton Live
- Restart your AI app completely
- Start a fresh conversation

See the [Troubleshooting Guide](./troubleshooting) for more help.

## Version History

See the full
[release history](https://github.com/adamjmurray/producer-pal/releases) on
GitHub.
