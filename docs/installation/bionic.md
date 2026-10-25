# Bionic / LM Studio

Run Producer Pal fully offline with Bionic / LM Studio, a free app that
downloads and runs AI models on your own computer and has its own chat window.
Prefer Producer Pal's chat window? See
[Bionic / LM Studio in the Built-in Chat UI](./bionic-chat-ui).

::: warning Needs a powerful computer and some patience

Local AI needs an Apple Silicon Mac with lots of memory, or a PC with a strong
Nvidia graphics card (see [Running Locally](./choose-local)). It takes more
setup than the online options, and it's slower and less smart.

:::

This guide is for Bionic. The older LM Studio app also works: follow LM Studio's
own MCP setup and use the same settings.

## Requirements

<!--@include: ../_partials/live-requirement.md-->

- [Bionic](https://lmstudio.ai/bionic)

Bionic is free, and so is running models on your computer. You don't need an LM
Studio account.

## Installation Steps

<!--@include: ../_partials/setup-by-ai.md-->

### 2. Install a Compatible Model

Download a model in Bionic under Settings &rarr; Explore, such as a recent
version of Qwen, Gemma, Mistral, or Nemotron. If your computer can handle it,
use the larger variants of a model.

It has to support tools. Your downloaded models are listed under Settings &rarr;
Library, where a hammer icon marks the ones that do:

<img src="/img/bionic-tool-icon.png" alt="The hammer icon marks a model that supports tools" width="400"/>

### 3. Add Producer Pal to Bionic

Go to Settings &rarr; Connected Apps and click "+ Add custom MCP" under **Manual
MCP server setup**:

<img src="/img/bionic-connected-apps.png" alt="Bionic's Connected Apps settings" width="650"/>

Fill in:

- **Name:** `Producer Pal`
- **Connection:** **On this computer**
- **Command:** `npx`
- Turn on **Show advanced options**, then use **+ Add argument** to add `-y` and
  `producer-pal@latest` as two separate arguments

<img src="/img/bionic-mcp-server-setup.png" alt="Adding Producer Pal as a custom MCP server in Bionic" width="650"/>

This way Bionic can start before Live, and it tells you when Live or the device
isn't running.

Click **Add MCP**. Producer Pal should show as connected, with its tools ready:

<img src="/img/bionic-mcp-server-connected.png" alt="Producer Pal connected in Bionic" width="650"/>

::: warning Restart Bionic after changing MCP settings

Adding a server or editing its arguments may not take effect until you restart
the app.

:::

### 4. Tune It for Your Model (Recommended)

**Skip this step until step 1 is finished** and the device is in your Live Set.
Small model mode hides the tool that sets Producer Pal up.

Bionic has no tool picker, so the MCP server's arguments are the only place to
narrow what Producer Pal offers — and small models do much better with a short
tool list. The same arguments also switch on the settings that make Producer Pal
easier for a local model to drive:

- `--small-model-mode` — a smaller, simpler interface built for local models
- `--notation stark` — a literal `type: content` format with event-based drum
  hits, which small models handle better than the default bar|beat text
- `--tools core,clip,track` — a focused toolset, which also shrinks the
  [skills](/features#skills) the model reads on connect.

Edit the server under Settings &rarr; Connected Apps and add them as arguments,
one field each — a flag and its value are two separate arguments:

<img src="/img/bionic-mcp-server-settings.png" alt="Producer Pal configured for a small local model in Bionic" width="650"/>

<!--@include: ../_partials/toolset-tip.md-->

These flags apply to Bionic only. To set them for the whole device instead
(including the built-in chat UI and other connected clients), use Producer Pal's
"Setup" tab:

<img src="/img/small-model-mode.png" alt="Small model mode setting" width="375"/>

### 5. Start Using Producer Pal

Bionic works in a project tied to a local folder, so create one with **New
Project** before starting a conversation. An empty folder is recommended for
Producer Pal sessions. Feel free to put reference documents in it, such as
common workflow instructions or details of your preferred musical style and
production techniques.

Start a conversation and say "connect to ableton":

<img src="/img/bionic-success.png" alt="Bionic successfully connected to Producer Pal" width="700"/>

## Local Model Tips

- **Set the context length to 16k (16000) or higher** in the model's settings.
  This is how much the AI can keep in mind at once. About 8k is enough to
  connect and send a few messages. Higher is slower, so find the balance.
- **Keep it simple:** start from an empty Live Set and short material, like MIDI
  clips of 4 bars or less. Small models are told to delete and start over rather
  than make edits (other than simple additions).
- **When it goes wrong, back up.** Delete the last messages or edit your last
  message and try again, instead of trying to correct the AI.
- **Close apps you don't need** so the model gets more of your computer.

### Advanced Tips

- Skip `npx` by setting **Connection** to **Web address** with the URL
  `http://localhost:3350/mcp`. Live and the device must then be running before
  Bionic connects, and it won't reconnect on its own.
- Add tools back to `--tools` when you miss features. Every tool you add takes
  up room on every conversation.
- Follow-up messages are often faster than the first: the model reuses work from
  earlier turns.
- Run Ableton Live on a different computer on your local network.
- With a GGUF model, try the experimental Flash Attention setting and set the
  K/V caches' quantization to Q8 or Q4.
- To go further, [customize Producer Pal's Skills](/guide/customizing-skills)
  for your model. If you find a setup that works well, share it in
  [GitHub Discussions](https://github.com/adamjmurray/producer-pal/discussions).

## Troubleshooting

If it doesn't work, see the [Troubleshooting Guide](/support/troubleshooting).
