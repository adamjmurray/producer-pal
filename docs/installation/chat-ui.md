# Built-in Chat UI

Producer Pal includes a [built-in chat window](/guide/chat-ui) that runs in your
browser. To use it, add the Producer Pal device to a MIDI track in Live
([steps](/installation#install-the-device)), then click "Open Chat UI" on the
device.

<div class="download-band download-band-compact">
  <div class="download-actions">
    <a class="download-btn download-btn-primary" href="https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.amxd">
      <span class="download-btn-label">Download Max for Live Device</span>
      <span class="download-btn-sub">Producer_Pal.amxd — for Ableton Live</span>
    </a>
  </div>
</div>

The chat window needs an AI to talk to. Pick one of three ways to get one:

## Local AI

The AI runs on your own computer. Free, private and works offline, but less
smart than the online options.

::: warning Needs a powerful computer

An Apple Silicon Mac with lots of memory, or a PC with a strong Nvidia graphics
card (8 GB of video memory at least, 16 GB or more is better). On a regular
laptop, pick one of the online options below.

:::

- **[Ollama](./ollama)** — the easiest way to start
- **[LM Studio Bionic](./bionic#chat-ui)** — an app for downloading and managing
  models

[More about running locally →](./choose-local)

## AI Router (Recommended)

One account gets you AI models from every big company: Claude, Gemini, GPT and
more. Add some credit, then switch models whenever you like. You pay only for
what you use.

- **[OpenRouter](./chat-ui-other-providers#openrouter)**
- **[Vercel AI Gateway](./chat-ui-other-providers#vercel-ai-gateway)** — needs a
  credit card on file

## Your Own API Key

An API key is a code from an AI company that lets apps like Producer Pal use its
AI. Already have one, or want to go straight to one company? Use it here. Each
company charges for what you use.

- **[Gemini](./gemini)** (Google)
- **[OpenAI](./openai)**
- **[Anthropic](./chat-ui-other-providers#anthropic)** (Claude)
- **[Mistral](./chat-ui-other-providers#mistral)**
- **[Other companies](./chat-ui-other-providers#custom-providers)** — any
  service that works like OpenAI's

## Troubleshooting

If you have issues with the chat UI, see the
[Troubleshooting Guide](/support/troubleshooting).
