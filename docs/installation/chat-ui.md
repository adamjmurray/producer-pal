# Built-in Chat UI

Producer Pal includes a [built-in chat interface](/guide/chat-ui) that runs in
your browser. Click "Open Chat UI" in the Max for Live device to launch it.

<div class="download-band download-band-compact">
  <div class="download-actions">
    <a class="download-btn download-btn-primary" href="https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.amxd">
      <span class="download-btn-label">Download Max for Live Device</span>
      <span class="download-btn-sub">Producer_Pal.amxd — add it to a MIDI track in Ableton Live</span>
    </a>
  </div>
</div>

The chat UI supports multiple AI providers. Choose based on your needs:

## Cloud Providers

### Anthropic

Claude models, direct via API key.

- **Cost:** Trial credit to start, then pay-as-you-go
- **Setup:** Create an Anthropic account and API key
- **[Setup instructions →](./chat-ui-other-providers#anthropic)**

### Gemini

Google's AI.

- **Cost:** Free tier has strict rate limits; paid tier recommended for regular
  use
- **Setup:** Just need a Google account — the free API key works but is heavily
  rate-limited. For sustained use, add pay-as-you-go billing to your Google
  Cloud account, or use Gemini via [OpenRouter](#openrouter) instead.
- **[Get started with Gemini →](./gemini)**

### OpenRouter

Access hundreds of models through one API, including Claude, Gemini, and open
source models.

- **Cost:** Pay-as-you-go (some free models available)
- **Setup:** Create account and add credits
- **[Setup instructions →](./chat-ui-other-providers#openrouter)**

### Mistral

AI models from a French company with competitive pricing.

- **Cost:** Free tier with rate limits
- **Setup:** Create account for API key
- **[Setup instructions →](./chat-ui-other-providers#mistral)**

### OpenAI

GPT models with pay-as-you-go pricing.

- **Cost:** Pay-as-you-go only
- **Setup:** Create account and add credits
- **[Get started with OpenAI →](./openai)**

## Local / Offline

Run models on your own computer with no internet required.

### Ollama (Recommended)

Simple local model server with many model options.

- **Cost:** Free (uses your hardware)
- **Setup:** Install Ollama, download a model
- **[Get started with Ollama →](./ollama)**

### LM Studio Bionic

Desktop app for running local models with a visual interface.

- **Cost:** Free (uses your hardware)
- **Setup:** Install Bionic, download a model, enable CORS
- **[Setup instructions →](./chat-ui-other-providers#lm-studio-api)**

## Quick Comparison

| Provider   | Cost               | Internet Required | Best For               |
| ---------- | ------------------ | ----------------- | ---------------------- |
| Ollama     | Free               | No                | Privacy, offline use   |
| Anthropic  | Trial, then paid   | Yes               | Claude models directly |
| Gemini     | Free tier (limits) | Yes               | Quick testing          |
| OpenRouter | Pay-as-you-go      | Yes               | Access to many models  |
| Mistral    | Free tier          | Yes               | Alternative to Gemini  |
| OpenAI     | Pay-as-you-go      | Yes               | GPT models             |
| Bionic     | Free               | No                | Visual local model UI  |

## Troubleshooting

If you have issues with the chat UI, see the
[Troubleshooting Guide](/support/troubleshooting).
