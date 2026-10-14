---
outline: [2, 3]
---

# Upgrading Producer Pal

Upgrading takes two steps for most people. The latest version is
v{{ $frontmatter.version }}
([what's new?](https://github.com/adamjmurray/producer-pal/releases/latest)).

::: tip Let your AI do it

If you use `npx producer-pal` or the Claude Desktop extension and have the
[remote script](/guide/remote-script), update your AI app first (step 2 and
[Claude Desktop](#only-if-you-use-claude-desktop) below), then ask your AI to
update Producer Pal. It installs the new device in your User Library and swaps
it into the open Live Set.

:::

## 1. Replace the Max for Live device

Download the new
[Producer_Pal.amxd](https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.amxd)
and install it over the old one: open **User Library** (under Places) in Live's
browser, go to **Presets → MIDI Effects → Max MIDI Effect**, and drag
`Producer_Pal.amxd` into that folder:

<img src="/img/install-amxd-to-user-library.png" alt="Producer_Pal.amxd in Live's browser, in User Library → Presets → MIDI Effects → Max MIDI Effect" width="300"/>

Live asks whether to overwrite the old one. Click **OK**:

<img src="/img/upgrade-amxd-in-user-library.png" alt="Live asking whether to overwrite the existing Producer_Pal.amxd" width="450"/>

Reopen your Live Set to load the new version, then check the version number in
the device to confirm it worked.

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

## Less common situations

Most people can skip this section. Each part only matters if it describes your
setup.

### Device saved outside the User Library

Install it to the Max MIDI Effect folder as shown above from now on. Some
features look for it there, like a coding agent adding Producer Pal to a Live
Set, and more will. Your existing Sets still use the old copy: in each one,
delete the Producer Pal device and add it again from the Max MIDI Effect folder.

### Projects saved with "Collect All and Save"

If **Files from User Library** was set to **Yes**, the project keeps its own
copy of the device, so upgrading doesn't reach it. In each such project, delete
the Producer Pal device and add it again from the Max MIDI Effect folder.

<img src="/img/collect-all-and-save.png" alt="Live's Collect All and Save dialog with Files from User Library set to Yes" width="450"/>

### Upgrading from a version before 2.1.0

Copy your project context (the text in the device's Context tab) somewhere safe
before replacing the device, then paste it into the new one. Since 2.1.0,
project context is backed up in your Live Project folder and carries over on its
own
([one exception](/support/known-issues#recent-project-context-can-be-lost-on-a-device-upgrade-pre-2-1-0-devices)).

### Using `npx producer-pal` without `@latest`

Change it to `npx -y producer-pal@latest` so it always fetches the current
version. See
[`npx` is running an old version](/support/troubleshooting#npx-is-running-an-old-version).

### Calling Producer Pal from your own scripts

Over [MCP](/guide/npx-cli), the [REST API](/guide/rest-api), or an
[agent skill](/guide/skills), some input and output formats changed in 2.3.0.
See the [Migration Guide](/guide/migration).

## If something's not working

- Make sure you replaced the `.amxd` file, not added a second copy
- Try deleting the Producer Pal device from your Set and adding it again from
  the Max MIDI Effect folder
- Claude Desktop: make sure you uninstalled the old extension first
- Restart your AI app completely and start a fresh conversation

See the [Troubleshooting Guide](/support/troubleshooting) for more help.

## Version history

See the full
[release history](https://github.com/adamjmurray/producer-pal/releases) on
GitHub.
