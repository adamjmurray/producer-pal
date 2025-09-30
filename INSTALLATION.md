# <sub><img src="./doc/img/producer-pal-logo.svg" height="40"/></sub> Producer Pal Installation Guide

1. Download the
   [Producer Pal Max for Live device (`Producer_Pal.amxd`)](https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.amxd).

2. Add `Producer_Pal.amxd` to a MIDI track in
   [Ableton Live 12.2+](https://www.ableton.com/live/) with
   [Max for Live](https://www.ableton.com/live/max-for-live/) (e.g. Ableton Live
   Suite):

   <img src="./doc/img/install-in-ableton.png" alt="install in Ableton" width="500">

   It should show "Producer Pal Running".

3. Setup an AI model to use Producer Pal using one of the following guides (⭐️
   indicates recommended options):
   - [Anthropic Claude](#anthropic-claude-installation)
     - [Claude Desktop](#claude-desktop) ⭐️
     - [Claude Code](#claude-code) ⭐️
     - [claude.ai Web App](#claudeai-web-app)
   - [Google Gemini](#google-gemini)
     - [Gemini CLI](#gemini-cli) ⭐️
   - [OpenAI](#openai)
     - [Codex CLI](#codex-cli)⭐️
     - [ChatGPT web app](#chatgpt-web-app)
   - [LM Studio](#lm-studio) for local models useable with no Internet,
     including:
     - Mistral AI Magistral
     - Alibaba Qwen 3
     - OpenAI GPT OSS
   - [Other MCP-compatible LLMs](#other-mcp-compatible-llms)

4. Start a conversation with "connect to ableton"

If it doesn't work, see the [Troubleshooting Guide](#troubleshooting).

See the [Usage Guide](./README.md#usage) for ideas on how to use Producer Pal.

## Choosing a Connection Method

Depending on the AI model you want to use, you may have choices between the
following connection methods:

### MCP Bundle

The `Producer_Pal.mcpb` file
[(download latest version here)](https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.mcpb)
is an MCP bundle, which is an AI plugin for desktop apps in the
[.mcbp format](https://github.com/anthropics/mcpb). It can be setup quickly in a
few clicks with no special technical knowledge required.

⭐️ If you [use Claude](#anthropic-claude-installation) this is the easiest way
to start using Producer Pal. It is the same thing as
[the Producer Pal Claude Desktop extension](#claude-desktop).

Currently `Producer_Pal.mcpb` is only compatible with Claude Desktop.

### producer-pal-portal.js

⭐️ `producer-pal-portal.js`
[(download latest version here)](https://github.com/adamjmurray/producer-pal/releases/latest/download/producer-pal-portal.js)
is recommended over the HTTP connection method because it is more robust: it
works even if Ableton Live / Producer Pal is not running and will help you debug
connection issues.

The `producer-pal-portal.js` script can connect most local MCP-compatible AI
apps to Producer Pal. Technically, it proxies an
[MCP stdio transport](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#stdio)
client to the
[MCP server](https://modelcontextprotocol.io/docs/learn/server-concepts) running
over inside the Producer Pal Max for Live device via HTTP.

Note: this option requires [Node.js](https://nodejs.org/) to be installed. If
you don't want to install more stuff, try the HTTP connection method.

### HTTP

This is the most minimal install method. You only need the Producer Pal Max for
Live device and an MCP/HTTP-compatible AI app.

HTTP is the fastest way to try [Gemini CLI](#gemini-cli) and
[Claude Code](#claude-code) with Producer Pal.

HTTP is the only option for connecting remote clients like the
[claude.ai Web App](#claudeai-web-app) and [ChatGPT web app](#chatgpt-web-app),
but this also requires a [web tunnel](#web-tunneling-options). Note: You can
access Producer Pal from another computer on your local network without using a
web tunnel.

A downside compared to the `producer-pal-portal.js` script is you may need to
restart your AI app or refresh MCP servers if you forgot to run Ableton Live
with the Producer Pal Max for Live device first.

## Anthropic Claude Installation

No subscription is required to use Claude, but you must register an Anthropic
account and
[verify the account with a phone number](https://support.anthropic.com/en/articles/8287232-why-do-i-need-to-verify-my-phone-number).

### Claude Desktop

Claude Desktop is the easiest way to use Producer Pal with Claude.

1. Install [Claude Desktop](https://claude.ai/download)

2. Download the
   [Producer Pal Claude Desktop Extension (`Producer_Pal.mcpb`)](https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.mcpb)

3. Go to Claude Desktop &rarr; Settings &rarr; Extensions and:

   3a. If you already have extensions installed, drag and drop
   `Producer_Pal.mcp` into the Extensions screen:

   <img src="./doc/img/install-in-claude.png" alt="install in Claude Desktop" width="700">

   3b. Or, if you have never installed a Claude Desktop extension before, you
   need to click "Advanced settings" on the Extensions screen, then click
   "Install extension...", and choose the
   [Producer_Pal.mcpb](https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.mcpb)
   file.

    <img src="./doc/img/install-in-claude-first-extension.png" alt="install first extension in Claude Desktop" width="700">

4. Don't forget to click "Install" and complete the Claude Desktop installation:

   <img src="./doc/img/install-in-claude-2.png" alt="install in Claude Desktop, part 2" width="700">

5. You should see Producer Pal tools in Claude's "Search and Tools" menu (make
   sure it's enabled when starting a conversation):

   <img src="./doc/img/tools-in-claude.png" alt="Producer Pal tools in Claude" width="700">

6. Start a conversation with "connect to ableton"

   ![Producer Pal start a conversation](./doc/img/screenshot.png)

7. In order for Producer Pal to work, you need to allow the tools to be used:

   <img alt="Producer Pal allow tools" src="./doc/img/producer-pal-permission.png" width="450"/>

### Claude Code

[Claude Code](https://claude.com/product/claude-code) is a command line
interface for Claude.

Note: When using Producer Pal with coding tools such as Claude Code, it's best
to run the coding agent in an empty folder so it doesn't get distracted by an
unrelated coding project.

1. Install Claude Code: `npm install -g @anthropic/claude-code` (see
   [the official docs](https://www.anthropic.com/claude-code))
2. Configure the MCP server via one of these
   [connection methods](#choosing-a-connection-method):
   - with producer-pal-portal.js
     [(download latest version here)](https://github.com/adamjmurray/producer-pal/releases/latest/download/producer-pal-portal.js)
     ```bash
     claude mcp add producer-pal -- node /absolute/path/to/producer-pal-portal.js
     ```
   - or via HTTP
     ```bash
     claude mcp add --transport http producer-pal http://localhost:3350/mcp
     ```
3. Start Claude Code by running `claude` (ideally in an empty folder)
4. Start a conversation with "connect to ableton"

### claude.ai Web App

To use Producer Pal through [the Claude web interface](https://claude.ai/new):

1. Set up [a web tunnel](#web-tunneling-options) to expose your local Producer
   Pal server, for example:

   ```bash
   ngrok http http://localhost:3350
   ```

   This gives you a public URL like `https://1234abcd.ngrok-free.app`

2. Go to [claude.ai settings](https://claude.ai/settings/connectors)
3. Add a Custom Connector with your tunnel URL + `/mcp`:
   ```
   https://1234abcd.ngrok-free.app/mcp
   ```
4. Start a conversation with "connect to ableton"

## Google Gemini

If you have a Google account, you can use Gemini for free with generous usage
limits that reset daily.

### Gemini CLI

[Gemini CLI](https://developers.google.com/gemini-code-assist/docs/gemini-cli)
is a command line interface for Google Gemini.

Note: When using Producer Pal with coding tools such as Gemini CLI, it's best to
run the coding agent in an empty folder so it doesn't get distracted by an
unrelated coding project.

1. [Install Gemini CLI](https://github.com/google-gemini/gemini-cli?#-installation)
2. Configure MCP severs in `~/.gemini/settings.json` using one of the supported
   [connection methods](#choosing-a-connection-method):
   - with producer-pal-portal.js
     [(download latest version here)](https://github.com/adamjmurray/producer-pal/releases/latest/download/producer-pal-portal.js)

     ```json
     {
       "mcpServers": {
         // ... other MCP server configs ...
         "producer-pal": {
           "command": "node",
           "args": ["/absolute/path/to/producer-pal-portal.js"]
         }
       }
     }
     ```

   - with HTTP
     ```json
     {
       "mcpServers": {
         // ... other MCP server configs ...
         "producer-pal": {
           "httpUrl": "http://localhost:3350"
         }
       }
     }
     ```

3. Run `gemini` to start the Gemini CLI (ideally in an empty folder)
4. Start a conversation with "connect to ableton"

## OpenAI

### Codex CLI

[Codex CLI](https://developers.openai.com/codex/cli) is a command line interface
for OpenAI models.

At the time of writing, a paid OpenAI subscription is needed to use Codex CLI.
This may change later.

Note: When using Producer Pal with coding tools such as Codex CLI, it's best to
run the coding agent in an empty folder so it doesn't get distracted by an
unrelated coding project.

1. [Install OpenAI Codex](https://github.com/openai/codex#quickstart)
2. [Download `producer-pal-portal.js`](https://github.com/adamjmurray/producer-pal/releases/latest/download/producer-pal-portal.js)
3. Edit `~/.codex/config.toml`:

   ```toml
   [mcp_servers.producer-pal]
   command = "node"
   args = ["/absolute/path/to/producer-pal-portal.js"]
   ```

   Note: at the time of writing, `producer-pal-portal.js`is the only
   [connection method](#choosing-a-connection-method) that works with Codex CLI
   (HTTP is not supported).

4. Run `codex` (ideally in an empty folder)
5. Start a conversation with "connect to ableton"

### ChatGPT Web App

To use Producer Pal through [the ChatGPT web interface](https://chatgpt.com/):

1. Set up [a web tunnel](#web-tunneling-options) to expose your local Producer
   Pal server, for example:

   ```bash
   ngrok http http://localhost:3350
   ```

   Note your public URL (e.g., `https://1234abcd.ngrok-free.app`)

2. Go to [ChatGPT](https://chatgpt.com) → Settings
3. Enable Developer Mode. _Note: At the time of writing, a paid OpenAI
   subscription is needed to enable Developer Mode. This may change later._
4. Add a Custom Connector:
   - URL: Your tunnel URL + `/mcp` (e.g., `https://1234abcd.ngrok-free.app/mcp`)
   - No authentication required
   - Trust the connector
5. IMPORTANT: Start a new chat with Developer Mode and Producer Pal explicitly
   enabled
6. Start a conversation with "connect to ableton"

## LM Studio

Run AI models locally without an Internet connection.

**This functionality is experimental.** It only works on relatively new machines
with decent specs (Apple Silicon with lots of RAM or PCs with Nvidia 4080+
graphics cards). It requires more technical know-how to setup and debug. The
online options documented above (Claude, Gemini, and OpenAI's commercial GPT
models) work noticeably better and faster, however, completely offline and
private usage is compelling.

1. Download [LM Studio](https://lmstudio.ai/)
2. Install a compatible model:
   - Qwen 3+ (tested with the 4b-2507 and 4b-thinking-2507 models)
   - OpenAI GPT-OSS (tested with the 20B model)
   - Mistral AI Magistral (tested with the small-2509 model)
3. Configure MCP servers in LM Studio Settings → Program → Integrations → edit
   mcp.json using one of the supported
   [connection methods](#choosing-a-connection-method):
   - with producer-pal-portal.js
     [(download latest version here)](https://github.com/adamjmurray/producer-pal/releases/latest/download/producer-pal-portal.js)

     ```json
     {
       "mcpServers": {
         // ... other MCP server configs ...
         "producer-pal": {
           "command": "node",
           "args": ["/absolute/path/to/producer-pal-portal.js"]
         }
       }
     }
     ```

   - with HTTP

     ```json
     {
       "mcpServers": {
         // ... other MCP server configs ...
         "producer-pal": {
           "url": "http://localhost:3350/mcp"
         }
       }
     }
     ```

4. Start a conversation with "connect to ableton"

### Optimizing for Local Models

- Shut down every other app you don't need to be running (e.g. your web browser
  and chat apps)
- Consider running Ableton Live on a different machine on the local network
- **You probably need at least 16k context window size** because Producer Pal
  currently requires a fairly large context window with respect to local models
  (this should improve soon). Larger context windows are slower, so experiment.
- You need a context length of around 8k (8000) to start a conversation with
  Producer Pal, and that will only allow for a few messages before a new
  conversation must be started.
- A context length of 16k (16000) or higher is recommended for achieving useful
  results, but higher context lengths can make the model run significantly
  slower. Experiment to find the right balance.
- To get more out of your context length, disable some of the Producer Pal
  tools. A reasonable minimal toolset for experimentation is:
  - `ppal-connect`
  - `ppal-read-live-set`
  - `ppal-create-clip`
  - `ppal-read-clip`
  - `ppal-update-clip`
  - `ppal-playback`

  Try disabling all the other tools and add back ones whose features you miss.

- If an AI mistake wastes your context length, don't hesitate to delete recent
  messages from the chat, edit your last message to try to avoid the issue, and
  try again. Don't waste tokens correcting the LLM, back up and avoid the issue
  from happening.
- When using a model with the GGUF engine, try enabling the
  advanced/experimental settings for Flash Attention and setting the K/V caches'
  quantization to Q8 or Q4.
- Research how to optimize for your specific machine / GPU hardware

## Other MCP-compatible LLMs

Producer Pal works with any LLM that supports the Model Context Protocol.

You can use the
[stdio or HTTP connection method](#choosing-a-connection-method).

### Local MCP via stdio

[Download `producer-pal-portal.js`](https://github.com/adamjmurray/producer-pal/releases/latest/download/producer-pal-portal.js)
and configure your LLM MCP to use:

```bash
node /path/to/producer-pal-portal.js
```

### Local MCP via HTTP

Use the URL:

```
http://localhost:3350/mcp
```

Note: Sometimes an additional setting is needed for HTTP connections. For
example, [Cline](https://cline.bot/) requires `"type": "streamableHttp"` to be
configured along with the `url`.

In some apps, the `/mcp` path might be omitted from the URL. It is typically
present.

### Remote MCP via HTTP tunnel

For cloud-hosted LLMs or remote access:

1. Set up a tunnel (e.g., ngrok, Pinggy)
2. Configure your LLM with the public URL + `/mcp`

## Web Tunneling Options

For remote access to Producer Pal, you'll need a tunneling service.

_Note: Producer Pal performs no authentication, so anyone who knows your web
tunnel address can connect and control Ableton Live. You should keep your web
tunnel address secret._

### ngrok (Recommended)

- [Sign up](https://ngrok.com) for persistent URLs (paid) or use free tier with
  changing URLs
- Install: `brew install ngrok` (macOS) or download from website
- Run: `ngrok http http://localhost:3350`

### Pinggy

- No installation required on macOS
- Run: `ssh -R 80:localhost:3350 a.pinggy.io`
- Free tier limited to 60 minutes

## Troubleshooting

### AI won't use Producer Pal

Things to check:

- The Producer Pal Max for Live device has been added to Ableton Live and says
  "Producer Pal Running"
- The Producer Pal tools are enabled for the AI. AI apps let you disable tools
  and it's a good idea to disable tools you aren't using
- If the Producer Pal device was not running in Live, or the Producer Pal tools
  were not enabled, you may need to start a new conversation

Some AIs won't respond to "connect to ableton". Some may incorrectly claim they
have no way of interacting with Ableton Live. If you can see the Producer Pal
tools and they are enabled, try this:

- Ask the AI "what tools do you have?"
- Check the AI knows it has Producer Pal tools such as `ppal-connect`
- Say "call your ppal-connect tool"

Once you trigger a `ppal-connect` tool call, Producer Pal should work. If saying
"connect to ableton" doesn't achieve this, find a way to reliably trigger
`ppal-connect` with your AI. For example, "connect to ableton with your tools"
or "connect to ableton with your ppal-connect tool" might work more reliably.

If you can see the Producer Pal tools but the AI cannot, or will not call
`ppal-connect` no matter what you try, check you are using an AI model that
supports tools. Locally running models might not be compatible, for example,
many models supported by [LM Studio](#lm-studio) can't use tools.

### Connection Issues

- Ensure Producer Pal device is loaded and running in Ableton Live
- Check that port 3350 is not blocked by firewall
- For remote connections, verify your tunnel is active

### MCP Server Not Found

- Verify the full path to `producer-pal-portal.js` is correct
- Ensure Node.js is installed and accessible from your terminal

### Tools Not Appearing

- Toggle the Producer Pal device off and on in Live
- Restart your AI interface
- Check the Max console for error messages

## Support

For issues and questions:

- Ask a question in
  [the questions forum](https://github.com/adamjmurray/producer-pal/discussions/categories/questions)
- Report bugs in
  [the bug reports forum](https://github.com/adamjmurray/producer-pal/discussions/categories/bug-reports)
  or [issues list](https://github.com/adamjmurray/producer-pal/issues)
- Documentation: See [the README](./README.md) and
  [developer documentation](./DEVELOPERS.md).
