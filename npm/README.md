# <sub><img src="./producer-pal-logo.svg" height="40"/></sub> Producer Pal

AI music production assistant for Ableton Live via the Model Context Protocol
(MCP).

## Quick Start

Run the Producer Pal MCP bridge to connect any MCP client to Ableton Live:

```bash
npx producer-pal@latest
```

This starts a stdio-to-HTTP bridge that enables MCP clients (Claude Desktop,
Claude Code, Gemini CLI, Codex CLI, VS Code with Cline, LM Studio, etc.) to
communicate with the Producer Pal Max for Live device running in Ableton Live.

## Prerequisites

- **Ableton Live 12.3+** with Max for Live (e.g., Ableton Live Suite)
- **Producer Pal Max for Live device** - Download
  [`Producer_Pal.amxd`](https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.amxd)
  and add it to a MIDI track in Ableton Live
- **Node.js 20+**

> **Version Note:** The npm package version is independent of the Max for Live
> device version. Always use the latest of both.

## Configuration

Add Producer Pal to your MCP client's server configuration. The command is
`npx producer-pal@latest` with optional argument `-y` (for auto-install). Keep
the `@latest` — without it, `npx` runs any older global or project-local
`producer-pal` it finds instead of fetching the current one.

**Configuration examples:**

<details>
<summary>Claude Desktop</summary>

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "producer-pal": {
      "command": "npx",
      "args": ["-y", "producer-pal@latest"]
    }
  }
}
```

</details>

<details>
<summary>Claude Code</summary>

```bash
claude mcp add producer-pal npx producer-pal@latest
```

</details>

<details>
<summary>Gemini CLI</summary>

Edit `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "producer-pal": {
      "command": "npx",
      "args": ["-y", "producer-pal@latest"]
    }
  }
}
```

</details>

<details>
<summary>Codex CLI</summary>

Edit `~/.codex/config.toml`:

```toml
[mcp_servers.producer-pal]
command = "npx"
args = ["-y", "producer-pal@latest"]
```

</details>

<details>
<summary>LM Studio</summary>

Edit Settings → Program → Integrations → `mcp.json`:

```json
{
  "mcpServers": {
    "producer-pal": {
      "command": "npx",
      "args": ["-y", "producer-pal@latest", "--small-model-mode"]
    }
  }
}
```

The `--small-model-mode` flag enables [small model mode](#cli-flags). See the
[LM Studio guide](https://producer-pal.org/installation/lm-studio) for details.

</details>

<details>
<summary>Cline (VS Code extension)</summary>

Edit `cline_mcp_settings.json`:

```json
{
  "mcpServers": {
    "producer-pal": {
      "command": "npx",
      "args": ["-y", "producer-pal@latest"]
    }
  }
}
```

</details>

<details>
<summary>Other MCP clients</summary>

Use the command `npx producer-pal@latest` with optional argument `-y` for
auto-install. Consult your client's documentation for MCP server configuration
syntax.

</details>

### CLI Flags

Full reference: https://producer-pal.org/guide/npx-cli

- `--tools <list>` - Keep only these tools in this client, dropping the rest.
  Takes tool names (`read-clip` or `ppal-read-clip`) and group names (`core`,
  `clip`, `read-only`, …), comma or space separated. Withholding a tool also
  drops the part of the skills that teaches it, so a narrow toolset makes every
  conversation cheaper. Per client — the chat UI and your other MCP clients keep
  the full toolset.
- `--disable-tools <list>` - The inverse: drop the tools you list, keep the
  rest.
- `--list-tools` - Print the group names and the tools available right now, then
  exit. Combine with the flags above to see what a session would really get.
- `-s` / `--small-model-mode` - Enable
  [small model mode](https://producer-pal.org/installation/lm-studio)
  (simplifies tool interface for smaller LLMs and automatically enables it on
  the device)
- `-n` / `--notation <barbeat|midi-json|stark>` - Set the MIDI note notation the
  tools use (default: `barbeat`). When using a coding agent to **script or
  build** against Producer Pal (generating/parsing MIDI programmatically), pair
  `--notation midi-json` (notes as a JSON array) with `--format json`. For a
  normal music-making conversation, keep the default. This is a global device
  setting, so it also affects the chat UI and any other connected clients.
- `-f` / `--format <json|compact>` - Set the tool response format (default:
  `compact`, a token-optimized literal). `--format json` returns standard JSON
  that coding agents can parse with JSON tooling; keep the default `compact` for
  normal conversations to save tokens. Also a global device setting.
- `-l` / `--live-api` - Enable the opt-in Direct Live API tool (`ppal-live-api`)
  on the device, a low-level escape hatch for scripting and debugging directly
  against the Live Object Model. Not recommended as a default — the specialized
  tools are tuned for reliable results. The flag only ever _enables_ the tool.

### Environment Variables

Optional environment variables can be configured through your MCP client:

- `MCP_SERVER_ORIGIN` - URL for the Max for Live device (default:
  `http://localhost:3350`)
- `ALLOW_CONFIGURATION_OVERRIDES` - Gate for the setting env vars below
  (default: `false`). `TOOLS`, `DISABLE_TOOLS`, `SMALL_MODEL_MODE`, `NOTATION`,
  `FORMAT`, `JSON_OUTPUT`, and `LIVE_API` are honored only when this is `true`;
  otherwise the device's own settings stay authoritative. The equivalent CLI
  flags above are always applied — this gate covers env vars only, which are
  ambient and easily inherited.
- `TOOLS` / `DISABLE_TOOLS` - Env forms of the `--tools` / `--disable-tools`
  flags; require the gate above.
- `SMALL_MODEL_MODE` - Enable small model mode (default: `false`). Env form of
  the `--small-model-mode` flag; requires the gate above.
- `NOTATION` - MIDI note notation (`barbeat`, `midi-json`, or `stark`; default:
  `barbeat`). Env form of the `--notation` flag; requires the gate above.
- `FORMAT` - Tool response format (`json` or `compact`; default: `compact`). Env
  form of the `--format` flag; requires the gate above.
- `JSON_OUTPUT` - Boolean alias for `FORMAT` (`true` = json; default: `false`);
  requires the gate above.
- `LIVE_API` - Enable the Direct Live API tool (default: `false`). Env form of
  the `--live-api` flag; requires the gate above.
- `ENABLE_LOGGING` - Enable file logging (default: `false`)
- `VERBOSE_LOGGING` - Detailed debug logs (default: `false`)

Example with environment variables:

```json
{
  "mcpServers": {
    "producer-pal": {
      "command": "npx",
      "args": ["-y", "producer-pal@latest"],
      "env": {
        "MCP_SERVER_ORIGIN": "http://localhost:3350",
        "ENABLE_LOGGING": "true"
      }
    }
  }
}
```

**Note for Claude Desktop users:** The
[`.mcpb` extension bundle](https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.mcpb)
provides an easier setup alternative to `npx producer-pal`.

## Documentation

For complete documentation, setup guides, and usage examples, visit:

**https://producer-pal.org**

Source code and development:

**https://github.com/adamjmurray/producer-pal**

## Support

- [Discussions](https://github.com/adamjmurray/producer-pal/discussions)
- [Issues](https://github.com/adamjmurray/producer-pal/issues)

## License

GNU General Public License v3.0 or later (`GPL-3.0-or-later`) - see
[LICENSE](https://github.com/adamjmurray/producer-pal/blob/main/LICENSE).

Upstream notices for the third-party code bundled into this package ship in its
`licenses/` folder.
