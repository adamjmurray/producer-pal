---
title: npx producer-pal
description:
  Command-line reference for npx producer-pal, the MCP bridge that connects any
  MCP client to Ableton Live. Every flag, every environment variable.
head:
  - - meta
    - name: keywords
      content:
        npx producer-pal, Ableton MCP server CLI, producer-pal flags, MCP
        bridge, --tools, --disable-tools, --small-model-mode, --notation,
        --format
---

# `npx producer-pal`

`npx producer-pal` is the bridge MCP clients use to reach Ableton Live. Your
client spawns it, it speaks MCP over stdio, and it forwards everything to the
Producer Pal device over HTTP (`http://localhost:3350/mcp` by default).

It is not the MCP server. That runs inside the
[Max for Live device](/guide/device). The bridge exists because most MCP clients
launch a command rather than connect to a URL, and because a subprocess can
start before Ableton does and reconnect on its own. Needs
[Node.js 20+](https://nodejs.org/en/download).

This page is the flag and environment-variable reference. For setting it up in a
particular client, see the [installation guides](/installation), e.g.
[Claude Code](/installation/claude-code) or
[other MCP clients](/installation/other-mcp).

```bash
npx -y producer-pal@latest [flags]
```

Keep the `@latest`. Without a version tag, `npx` runs any `producer-pal` already
installed globally or in the current project's `node_modules` instead of
fetching, which is how the bridge ends up older than the device. See
[`npx` is running an old version](/support/troubleshooting#npx-is-running-an-old-version).

## Flags

| Flag                     | Alias | Value                           | Effect                                                                            |
| ------------------------ | ----- | ------------------------------- | --------------------------------------------------------------------------------- |
| `--tools <list>`         |       | tool/group names                | Keep only these tools in this client                                              |
| `--disable-tools <list>` |       | tool/group names                | Drop these tools from this client                                                 |
| `--list-tools`           |       |                                 | Print the groups and available tools, then exit                                   |
| `--notation <name>`      | `-n`  | `barbeat`, `midi-json`, `stark` | Set the [MIDI notation](/features/midi-notation) (default `barbeat`)              |
| `--format <name>`        | `-f`  | `compact`, `json`               | Set the tool response format (default `compact`)                                  |
| `--small-model-mode`     | `-s`  |                                 | Turn on [small model mode](/features#small-model-mode)                            |
| `--live-api`             | `-l`  |                                 | Turn on the [Direct Live API](/features/tools#ppal-live-api) tool for this client |

Values take either form: `--notation stark` or `--notation=stark`.

::: tip Every flag applies to this client only

The bridge sends its settings with each request, so nothing here changes the
device's [Setup tab](/guide/device), the [Chat UI](/guide/chat-ui), or any other
connected client. A flag you don't pass falls back to the device's own setting.

:::

## Choosing tools {#toolset}

<!--@include: ../_partials/toolset-tip.md-->

```json
{
  "command": "npx",
  "args": ["-y", "producer-pal@latest", "--tools", "core,clip,track"]
}
```

See [Optimizing](/guide/optimizing) for what a narrower toolset actually saves.

## `--list-tools`

Prints the group aliases both toolset flags accept, then the tools available
right now. The tool list comes from the running device when it can be reached,
so it reflects your device's version and whether the Direct Live API is on. It
falls back to the bridge's own catalog when Ableton isn't running. Combine it
with a toolset flag to see exactly what a session would get:

```bash
npx producer-pal@latest --tools clip,track --list-tools
```

```
Producer Pal 2.1.0 tools and groups

Pass any of these to --tools (keep only these) or --disable-tools (drop
these), comma or space separated. Names work bare or ppal- prefixed.

  core       ppal-connect ppal-context
  session    ppal-playback ppal-library ppal-select
  actions    ppal-delete ppal-duplicate
  live-set   ppal-read-live-set ppal-update-live-set
  track      ppal-create-track ppal-read-track ppal-update-track
  scene      ppal-create-scene ppal-read-scene ppal-update-scene
  clip       ppal-create-clip ppal-read-clip ppal-update-clip
  device     ppal-create-device ppal-read-device ppal-update-device
  advanced   ppal-live-api
  read-only  ppal-connect ppal-library ppal-select ppal-read-live-set ...

ppal-connect is always kept: it is how an MCP client reaches the Skills.
ppal-live-api also needs --live-api or the device's Setup-tab toggle.

Available now (7):

  ppal-connect
  ppal-create-clip
  ppal-create-track
  ppal-read-clip
  ppal-read-track
  ppal-update-clip
  ppal-update-track
```

## Environment variables

Every setting flag has an environment-variable form, for clients whose MCP
config is easier to write with `env` than with `args`.

| Variable            | Values                          | Effect                                                |
| ------------------- | ------------------------------- | ----------------------------------------------------- |
| `MCP_SERVER_ORIGIN` | URL                             | Where the device is (default `http://localhost:3350`) |
| `TOOLS`             | tool/group names                | `--tools`                                             |
| `DISABLE_TOOLS`     | tool/group names                | `--disable-tools`                                     |
| `NOTATION`          | `barbeat`, `midi-json`, `stark` | `--notation`                                          |
| `FORMAT`            | `compact`, `json`               | `--format`                                            |
| `JSON_OUTPUT`       | `true` / `false`                | Boolean alias for `FORMAT`; `FORMAT` wins             |
| `SMALL_MODEL_MODE`  | `true` / `false`                | `--small-model-mode`                                  |
| `LIVE_API`          | `true` / `false`                | `--live-api`                                          |
| `ENABLE_LOGGING`    | `true` / `false`                | Write a bridge log file                               |
| `VERBOSE_LOGGING`   | `true` / `false`                | Add debug detail to that log                          |

::: tip Settings are yours alone

Every setting rides along as a request header, so it applies to your bridge and
nothing else. The device's own settings, the [chat UI](/guide/chat-ui), and any
other connected client are untouched.

Unlike the flags, the boolean variables are three-state.
`SMALL_MODEL_MODE=false` actively turns the setting _off_ for this bridge, where
the flag can only turn it on. Leave a variable unset (or blank) to follow the
device's setting.

:::

An invalid value is logged and ignored rather than fatal, so a bridge that `npx`
cached before your device was updated still starts when handed a tool name or
notation it doesn't recognize.

## Logs

With `ENABLE_LOGGING=true` the bridge writes `bridge-YYYY-MM-DD.log` to:

| Platform | Location                            |
| -------- | ----------------------------------- |
| macOS    | `~/Library/Logs/Producer Pal/`      |
| Windows  | `%LOCALAPPDATA%\ProducerPal\Logs\`  |
| Linux    | `~/.local/share/Producer Pal/logs/` |

Add `VERBOSE_LOGGING=true` for per-request detail. See
[Troubleshooting](/support/troubleshooting) for what to look for.

## Other ways in

The bridge is one of four ways to drive Producer Pal:

- **HTTP MCP**: point an MCP client straight at `http://localhost:3350/mcp`, no
  Node required. Ableton has to be running first, and there's no
  auto-reconnection. See [other MCP clients](/installation/other-mcp).
- **[REST API](/guide/rest-api)**: plain HTTP for scripts, with
  [per-request headers](/guide/rest-api#per-request-settings) for toolset,
  notation, and small-model mode.
- **[Agent Skill](/guide/skills)**: the portable `SKILL.md` for coding agents,
  which drives the REST API.
