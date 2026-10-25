# Ollama

Run Producer Pal on your own computer: free, private and offline.

::: warning Needs a powerful computer

Local AI needs an Apple Silicon Mac with lots of memory, or a PC with a strong
Nvidia graphics card. See [Running Locally](./choose-local) to check yours.

:::

## What You Need

<!--@include: ../_partials/live-requirement.md-->

## 1. Install Ollama

Download and install [Ollama](https://ollama.com/download).

## 2. Download a Model

Pick a model that can control other apps (Ollama calls this "tools"). Good ones:

- `qwen3.8`
- `gemma4`
- `muse-glimmer`
- `mistral-small3.2`

Open Terminal (Mac) or Command Prompt (Windows), type this and press Enter:

```
ollama pull qwen3.8
```

Swap in another name to get a different model. If your computer can handle it, a
bigger version of a model is smarter. Browse more
[models that support tools](https://ollama.com/search?c=tools).

## 3. Give the Model Enough Room

Open the Ollama app's settings and set **Context length** to **16k or higher**.
This is how much the AI can keep in mind at once. Producer Pal's instructions
don't fit in the default, and the AI can't use Producer Pal without them. More
room uses more memory.

Running Ollama without the app? Set `OLLAMA_CONTEXT_LENGTH=16384` instead.

## 4. Install the Max for Live Device

<!--@include: ../_partials/device-steps.md-->

## 5. Turn On Small Model Mode (Recommended)

In the device's [Setup tab](/guide/device#setup-tab), turn on **Small Model
Mode**. It gives local AI a simpler set of tools.

<img src="/img/small-model-mode.png" alt="Small model mode setting" width="375"/>

## 6. Open the Chat UI

In the Producer Pal device's Main tab, click "Open Chat UI". The built-in chat
UI opens in a browser:

![Chat UI](/img/producer-pal-chat.png)

## 7. Set Up Ollama in the Chat UI

In the chat UI settings:

- Provider: **Ollama (local)**
- URL: leave it as `http://localhost:11434` (to run Ollama on another computer,
  see [the user guide](/guide/chat-ui#local-ai-settings-ollama-bionic))
- Model: the name you downloaded, like `qwen3.8`

Click "Save".

<img src="/img/producer-pal-chat-settings-connection-ollama.png" alt="Ollama settings" width="500"/>

## 8. Connect

Click "Quick Connect". It says "Connect to Ableton." for you:

![Producer Pal Chat UI conversation](/img/producer-pal-chat-conversation.png)

::: tip Local Model Limitations

Local models work best for simple tasks. Complex edits may require more capable
cloud models.

:::

<!-- TODO: Embed YouTube video walkthrough -->

## Troubleshooting

- **Garbled text like `<|tool_call_start|>...`, or it says it can't connect to
  Ableton:** the model can't use tools. Try another one from the
  [tools list](https://ollama.com/search?c=tools).
- **It says the model isn't installed, but you downloaded it:** enter the full
  name, including the part after the colon (like `muse-glimmer:30b-mlx`). Type
  `ollama list` in Terminal to see the exact names.
- **The first reply is slow:** that's normal. Later replies in the same chat are
  usually much faster.

For anything else, see the [Troubleshooting Guide](/support/troubleshooting).
