# Upgrading Producer Pal

Upgrading takes two steps for most people. The latest version is
v{{ $frontmatter.version }}
([what's new?](https://github.com/adamjmurray/producer-pal/releases/latest)).

## 1. Replace the Max for Live device

Download the new
[Producer_Pal.amxd](https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.amxd)
and put it where you saved the old one (usually your Live User Library),
replacing the old file. Your Live Sets will pick up the new version
automatically.

Check the version number in the device to confirm it worked.

## 2. Restart your AI app

Quit and reopen your AI app, then start a fresh conversation. That's it.

## Only if you use Claude Desktop

Claude Desktop also needs its extension updated:

1. Download the new
   [Producer_Pal.mcpb](https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.mcpb)
2. In Claude Desktop, go to Settings → Extensions
3. Click the `...` menu on Producer Pal and choose "Uninstall"
4. Open the new `Producer_Pal.mcpb` file to install it (see
   [Claude Desktop installation](./claude-desktop))

Everything else (the built-in chat, Claude Code, Codex, Gemini CLI, and other
apps set up with `npx -y producer-pal@latest`) updates itself. No extra steps.

## If something's not working

- Make sure you replaced the `.amxd` file, not added a second copy
- Try deleting the Producer Pal device from your Set and adding it again
- Claude Desktop: make sure you uninstalled the old extension first
- Restart your AI app completely and start a fresh conversation

See the [Troubleshooting Guide](/support/troubleshooting) for more help.

## Less common situations

Most people can stop reading here. These only matter if one of them describes
your setup.

**Projects saved with "Collect All and Save".** Those projects keep their own
copy of the device. Drag the new `.amxd` into them to replace it.

**Upgrading from a version before 2.1.0.** Copy your project context (the text
in the device's Context tab) somewhere safe before replacing the device, then
paste it into the new one. Since 2.1.0, project context is backed up in your
Live Project folder and carries over on its own
([one exception](/support/known-issues#recent-project-context-can-be-lost-on-a-device-upgrade-pre-2-1-0-devices)).

**Using `npx producer-pal` without `@latest`.** Change it to
`npx -y producer-pal@latest` so it always fetches the current version. See
[`npx` is running an old version](/support/troubleshooting#npx-is-running-an-old-version).

**Calling Producer Pal from your own scripts** (over [MCP](/guide/npx-cli), the
[REST API](/guide/rest-api), or an [agent skill](/guide/skills))? Some input and
output formats changed in 2.3.0. See the [Migration Guide](/guide/migration).

## Version history

See the full
[release history](https://github.com/adamjmurray/producer-pal/releases) on
GitHub.
