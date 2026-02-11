# Other Providers

The built-in chat UI supports OpenAI API, Mistral, OpenRouter, and custom
OpenAI-compatible providers.

::: warning Pay-as-you-go Pricing

Most of these options (besides LM Studio) use pay-as-you-go pricing which can
incur cost quickly with advanced models and long conversations. Monitor your API
key usage.

:::

## Setup Steps

1. Download
   [Producer_Pal.amxd](https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.amxd)
   and drag it to a MIDI track in Ableton Live
2. In the Producer Pal device, click "Open Chat UI"
3. Configure your provider as described below
4. Click "Quick Connect" and say "connect to ableton"

## Available Providers

### OpenRouter

[OpenRouter](https://openrouter.ai) is an "AI gateway" with hundreds of LLMs in
one place. Includes free and pay-as-you-go options.

1. [Get an OpenRouter API key](https://openrouter.ai/settings/keys)
2. In the chat UI settings:
   - Provider: **OpenRouter**
   - API Key: Your key
   - Model: e.g., `anthropic/claude-sonnet-4`, `google/gemini-2.5-pro`

### Mistral

[Mistral](https://mistral.ai/) offers AI models developed in France. Free tier
available with fairly aggressive quotas.

1. [Get a Mistral API key](https://console.mistral.ai/home?workspace_dialog=apiKeys)
2. In the chat UI settings:
   - Provider: **Mistral**
   - API Key: Your key
   - Model: e.g., `mistral-large-latest`

### OpenAI API

[OpenAI](https://openai.com/api/) offers GPT models with pay-as-you-go pricing.

1. [Get an OpenAI API key](https://platform.openai.com/api-keys)
2. In the chat UI settings:
   - Provider: **OpenAI**
   - API Key: Your key
   - Model: e.g., `gpt-4o`, `gpt-4.1`

::: tip Subscription Alternative

Prefer flat-rate pricing? [Codex CLI](./codex-cli) works with OpenAI's
subscription plans.

:::

## Custom Providers

For other OpenAI-compatible providers:

1. In the chat UI settings:
   - Provider: **Custom (OpenAI-compatible)**
   - API Key: Your provider's key
   - URL: Your provider's API endpoint
   - Model: The model name

### Example: Groq

- Provider: Custom (OpenAI-compatible)
- URL: `https://api.groq.com/openai/v1`
- Model: `llama-3.3-70b-versatile`

## Privacy Note

Your API key is stored in browser local storage. Use a private browser session
if that concerns you, or delete the key from settings after use.

## LM Studio API

For free locally running models, you can use [LM Studio](https://lmstudio.ai/)
with the built-in chat UI instead of [LM Studio's native UI](./lm-studio).

1. Install LM Studio and download a model that supports tools
2. Go to the LM Studio developer tab
3. Open Server Settings and configure:
   - **Server Port** - Should be `1234` (if different, adjust the URL in your
     Producer Pal connection settings to match)
   - **Enable CORS** - Required for browser access
   - **Serve on Local Network** - Enable this if running LM Studio on a
     different computer (allows other devices to connect)

   ![LM Studio server settings](/lm-studio-server-settings.png)

4. Start the LM Studio server (should say "Status: Running")
5. In the Producer Pal Chat UI settings:
   - Provider: **LM Studio (local)**
   - URL: Copy from LM Studio's "Reachable at:" field
     - Default when everything runs on the same computer:
       `http://localhost:1234`
     - When "Serve on Local Network" is enabled, use the network address shown
       (e.g., `http://192.168.7.172:1234`)
   - Model: A model that supports tools, such as `qwen/qwen3-vl-8b`,
     `openai/gpt-oss-20b`, or `mistralai/magistral-small-2509`
6. Save and click "Quick Connect"

::: warning Model Tool Support

If the model responds with garbled text like `<|tool_call_start|>...` or says it
can't connect to Ableton, the model doesn't support tools. Look for the hammer
icon next to models:

![LM Studio tool icon](/lm-studio-tool-icon.png)

:::

::: tip Small Model Mode

Enable "Small Model Mode" in the Producer Pal Setup tab for better compatibility
with local models. See [LM Studio tips](./lm-studio#local-model-tips) for more
optimization advice.

:::

## Troubleshooting

If the built-in chat doesn't work, see the
[Troubleshooting Guide](./troubleshooting).
