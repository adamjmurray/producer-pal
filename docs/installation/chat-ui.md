# Producer Pal Chat UI

Producer Pal includes its own chat interface, independent from Claude Desktop,
Gemini CLI, or any other AI platform. The chat UI is served as a web page from
the Max for Live device and opens in your system's default browser.

The chat UI supports multiple LLM providers including Google Gemini, OpenAI,
Mistral, OpenRouter, local models via LM Studio and Ollama, and custom
OpenAI-compatible providers.

**Using the built-in chat UI with Google Gemini's free tier is one of the
easiest (and recommended) ways to use Producer Pal.**

::: warning Cost Note Some options use pay-as-you-go pricing for API access,
which can incur cost quickly when using advanced models and having long
conversations. Always monitor your API key usage when using pay-as-you-go
options. :::

## Requirements

- [Ableton Live 12.2+](https://www.ableton.com/live/) with
  [Max for Live](https://www.ableton.com/live/max-for-live/)
- Any LLM API that supports tools and has an OpenAI-compatible interface, or
  Google's Gemini API

Choose from these options:

### Online LLM APIs

- **[Google Gemini API](https://ai.google.dev/gemini-api)** (recommended): All
  Google accounts can use the free tier with generous daily quotas.
  [Get a Gemini API key](https://aistudio.google.com/apikey).
- **[OpenAI API](https://openai.com/api/)**: Requires pay-as-you-go pricing.
  [Get an OpenAI API key](https://platform.openai.com/api-keys). Also consider
  [Codex CLI](./codex-cli) to use OpenAI with Producer Pal on a subscription
  plan (flat rate, not pay-as-you-go).
- **[Mistral](https://mistral.ai/)**: AI developed in France. Can be used for
  free but with fairly aggressive quotas.
  [Get a Mistral API key](https://console.mistral.ai/home?workspace_dialog=apiKeys).
- **[OpenRouter](https://openrouter.ai)**: An "AI gateway" with hundreds of LLMs
  available in one place. Includes free and pay-as-you-go options.
  [Get an OpenRouter API key](https://openrouter.ai/settings/keys).
- **Custom**: Any other compatible LLM. See
  [Using Custom Providers](#using-custom-providers).

### Offline LLMs

Run models locally:

- [LM Studio](#lm-studio-with-the-producer-pal-chat-ui)
- [Ollama](#ollama)

## Installation Steps

### 1. Install the Max for Live Device

Download
[Producer_Pal.amxd](https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.amxd),
the Producer Pal Max for Live device, and add it to a MIDI track in Ableton
Live:

![Producer Pal device running in Ableton Live](/device-main-tab.png)

_It should display "Producer Pal Running" or something isn't working._

### 2. Open the Chat UI

Open the "Setup" tab in the device and click "Open Chat UI", which will open
`http://localhost:3350/chat` (or whatever port Producer Pal is setup to use)

![Producer Pal Setup tab with Open Chat UI button](/device-setup-tab.png)

### 3. Configure Your LLM

If it's your first time, choose a provider, enter an API key (if using an online
LLM), and choose a model. See below for examples and more info about the various
settings. Once you've configured your settings, click "Save".

### 4. Start Chatting

Click the "Quick Connect" button to start a chat:

![Producer Pal Chat UI](/built-in-chat-ui.png)

Or type whatever you want into the text input.

The chat UI connects directly to your chosen LLM provider's API and uses
Producer Pal's MCP tools automatically.

::: tip Privacy Note for Online APIs Your API key is stored in the browser's
local storage for convenience. If that concerns you, use a private browser
session, delete the key from settings after use, or delete browser local storage
after use. You can delete and regenerate API keys with the AI provider if a key
is accidentally shared. :::

## Chat UI Model Settings

### Thinking

Some models support extended reasoning where they "think through" problems
before responding. This increases response time and token usage but can improve
quality for complex tasks. Enable if your model supports it and you need more
sophisticated musical decisions. Some reasoning models, such as Gemini, support
showing their "thoughts".

### Randomness (0%-100%)

Controls AI response randomness. Lower values (0% - 50%) make the model more
focused and deterministic. Higher values (50% - 100%) make it more creative but
potentially less coherent. Default is 50%. For music composition, try higher
values depending on how experimental you want the results.

## Using Local Providers

### LM Studio with the Producer Pal Chat UI

You can use LM Studio with the built-in chat UI as explained here, or you can
[use LM Studio's UI](./lm-studio) if you prefer.

1. Install [LM Studio](https://lmstudio.ai/) and download some models
2. Go to the LM Studio developer tab
3. Open Server Settings and Enable CORS. Producer Pal's chat UI runs in the
   browser and cannot directly connect to LM Studio without this option:

   ![LM Studio server settings](/lm-studio-server-settings.png)

4. Start LM Studio server. It should say: "Status: Running"
5. Configure the Producer Pal Chat UI:
   - Provider: LM Studio (local)
   - Port: 1234 (This is the default. If you change it in LM Studio settings,
     change this setting to match)
   - Model: A model that supports tools, such as `qwen/qwen3-vl-8b`,
     `openai/gpt-oss-20b`, or `mistralai/magistral-small-2509`

   ::: warning Model Tool Support If the model responds with garbled text like
   `<|tool_call_start|>...` or says it has no way of connecting to Ableton, the
   model likely doesn't support tools. Try a different model. Look for a hammer
   icon next to the model:

   ![LM Studio tool icon](/lm-studio-tool-icon.png) :::

6. Save the Chat UI settings and use the Quick Connect button to start a
   conversation.

See the [LM Studio install guide](./lm-studio) for tips on choosing and
configuring models with LM Studio. It's recommended you enable the "Small Model
Mode" option in the Producer Pal Setup tab for better compatibility with local
models.

### Ollama

1. Install [Ollama](https://ollama.com/)
2. If you haven't already, run Ollama, select some of the downloadable
   (non-cloud) models, and start a chat with them to download them.
3. With Ollama running, configure the Producer Pal Chat UI:
   - Provider: Ollama (local)
   - Port: 11434 (This is the default. You generally don't need to change this)
   - Model: A [model that supports tools](https://ollama.com/search?c=tools),
     such as `qwen3-vl:8b`, `qwen-3-coder`, or `gpt-oss:20b`
4. Save the Chat UI settings and use the Quick Connect button to start a
   conversation.

## Using Custom Providers

To use other OpenAI-compatible providers beyond the built-in options:

1. Open the chat UI settings
2. Select "Custom (OpenAI-compatible)" as the provider
3. Enter your API key
4. Set the Base URL for your provider
5. Enter the model name

### Custom Provider Example: Groq

- Provider: Custom (OpenAI-compatible)
- Base URL: `https://api.groq.com/openai/v1`
- Model: `moonshotai/kimi-k2-instruct` (or other available models like
  `openai/gpt-oss-120b`, `qwen/qwen3-32b`)

## Troubleshooting

If it doesn't work, see the [Troubleshooting Guide](./troubleshooting).
