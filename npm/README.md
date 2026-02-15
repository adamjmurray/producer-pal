# <sub><img src="./producer-pal-logo.svg" height="40"/></sub> Producer Pal

AI music production assistant for Ableton Live via the Model Context Protocol
(MCP).

## Quick Start

Run the Producer Pal MCP bridge to connect any MCP client to Ableton Live:

```bash
npx producer-pal
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
`npx producer-pal` with optional arguments `-y` (for auto-install).

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
      "args": ["-y", "producer-pal"]
    }
  }
}
```

</details>

<details>
<summary>Claude Code</summary>

```bash
claude mcp add producer-pal npx producer-pal
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
      "args": ["-y", "producer-pal"]
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
args = ["-y", "producer-pal"]
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
      "args": ["-y", "producer-pal", "-s"]
    }
  }
}
```

The `-s` flag enables [small model mode](#cli-flags). See the
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
      "args": ["-y", "producer-pal"]
    }
  }
}
```

</details>

<details>
<summary>Other MCP clients</summary>

Use the command `npx producer-pal` with optional argument `-y` for auto-install.
Consult your client's documentation for MCP server configuration syntax.

</details>

### CLI Flags

- `-s` / `--small-model-mode` - Enable
  [small model mode](https://producer-pal.org/installation/lm-studio)
  (simplifies tool interface for smaller LLMs and automatically enables it on
  the device)

### Environment Variables

Optional environment variables can be configured through your MCP client:

- `MCP_SERVER_ORIGIN` - URL for the Max for Live device (default:
  `http://localhost:3350`)
- `SMALL_MODEL_MODE` - Enable small model mode (default: `false`). Equivalent to
  the `-s` flag above.
- `ENABLE_LOGGING` - Enable file logging (default: `false`)
- `VERBOSE_LOGGING` - Detailed debug logs (default: `false`)

Example with environment variables:

```json
{
  "mcpServers": {
    "producer-pal": {
      "command": "npx",
      "args": ["-y", "producer-pal"],
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

MIT License - see
[LICENSE](https://github.com/adamjmurray/producer-pal/blob/main/LICENSE)
