# Other Providers

The built-in chat UI supports the Anthropic API, OpenAI API, Mistral,
OpenRouter, and custom OpenAI-compatible providers.

<div class="download-band download-band-compact">
  <div class="download-actions">
    <a class="download-btn download-btn-primary" href="https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.amxd">
      <span class="download-btn-label">Download Max for Live Device</span>
      <span class="download-btn-sub">Producer_Pal.amxd — add it to a MIDI track in Ableton Live</span>
    </a>
  </div>
</div>

::: warning Pay-as-you-go Pricing

Most of these options (besides Bionic) use pay-as-you-go pricing which can incur
cost quickly with advanced models and long conversations. Monitor your API key
usage.

:::

## Setup Steps

1. Download
   [Producer_Pal.amxd](https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.amxd)
   and drag it to a MIDI track in Ableton Live
2. In the Producer Pal device, click "Open Chat UI"
3. Configure your provider as described below
4. Click "Quick Connect" and say "connect to ableton"

## Available Providers

### Anthropic

[Anthropic](https://console.anthropic.com/) offers Claude models directly via
API key. See [Using Claude with Producer Pal](./choose-claude) for the other
ways to run Claude.

1. [Get an Anthropic API key](https://console.anthropic.com/settings/keys)
2. In the chat UI settings:
   - Provider: **Anthropic**
   - API Key: Your key
   - Model: e.g., `claude-sonnet-5`

### OpenRouter

[OpenRouter](https://openrouter.ai) is an "AI gateway" with hundreds of LLMs in
one place. Includes free and pay-as-you-go options.

1. [Get an OpenRouter API key](https://openrouter.ai/settings/keys)
2. In the chat UI settings:
   - Provider: **OpenRouter**
   - API Key: Your key
   - Model: e.g., `anthropic/claude-sonnet-5`, `google/gemini-3.6-flash`

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
For detailed setup, see the [dedicated OpenAI guide](./openai).

1. [Get an OpenAI API key](https://platform.openai.com/api-keys)
2. In the chat UI settings:
   - Provider: **OpenAI**
   - API Key: Your key
   - Model: e.g., `gpt-5.6-terra`

::: tip Subscription Alternative

Prefer flat-rate pricing? The [ChatGPT App](./chatgpt-app) or
[Codex CLI](./codex-cli) work with OpenAI's subscription plans.

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

## LM Studio Bionic API {#lm-studio-api}

For free locally running models, you can use
[LM Studio Bionic](https://lmstudio.ai/bionic) as a server for the built-in chat
UI, instead of [Bionic's own interface](./bionic).

1. Install Bionic and download a model that supports tools
2. Go to Settings &rarr; Local Model API and turn on:
   - **Local API server** - It should then read "Running"
   - **CORS** - Required for browser access

   Copy the **Base URL** while you're here (`http://localhost:1234/v1` by
   default — use "Edit port" to change it):

   ![Bionic's Local Model API settings](/img/bionic-server-settings.png)

3. Make sure a model is available to the API. Either turn on **Just-in-time
   model loading** so requests load one on demand, or preload a model by having
   a quick chat with it in Bionic first — which is also a good way to confirm it
   works before pointing Producer Pal at it. Loaded models are listed under
   Settings &rarr; Loaded Instances:

   ![A loaded model instance in Bionic](/img/bionic-loaded-instances.png)

4. In the Producer Pal Chat UI settings:
   - Provider: **Bionic / LM Studio (local)**
   - URL: The Base URL you copied
   - Model: A model that supports tools, such as `qwen/qwen3.5-9b`,
     `google/gemma-4-e4b`, `mistralai/devstral-small-2-2512`, or
     `zai-org/glm-4.7-flash`
5. Save and click "Quick Connect"

::: tip Server not behaving?

Turn on **Verbose logs** under Settings &rarr; Local Model API for debug-level
detail, then read **Server logs** on the same page.

:::

::: warning Model Tool Support

If the model responds with garbled text like `<|tool_call_start|>...` or says it
can't connect to Ableton, the model doesn't support tools. Under Settings &rarr;
Library, a hammer icon marks the models that do:

![A model that supports tools](/img/bionic-tool-icon.png)

:::

::: tip Small Model Mode

Enable "Small Model Mode" in the Producer Pal Setup tab for better compatibility
with local models. See [Bionic tips](./bionic#local-model-tips) for more
optimization advice.

:::

## Troubleshooting

If the built-in chat doesn't work, see the
[Troubleshooting Guide](/support/troubleshooting).
