# Ollama

Run Producer Pal completely offline with local models.

## What You Need

- [Ollama](https://ollama.com/) installed
<!--@include: ../_partials/live-requirement.md-->

## 1. Install Ollama

Download and install [Ollama](https://ollama.com/) for your operating system.

## 2. Download a Model

Download a model that supports tools. Some good options include:

- `qwen3.5`
- `gemma4`
- `devstral-small-2`
- `glm-4.7-flash`

Browse [models with tool support](https://ollama.com/search?c=tools) on the
Ollama website.

## 3. Install the Max for Live Device

Download
[Producer_Pal.amxd](https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.amxd)
and drag it to a MIDI track in Ableton Live.

It should display "Producer Pal Running":

<img src="/img/device-main-tab.png" alt="Producer Pal device running in Ableton Live" width="375"/>

## 4. Enable Small Model Mode (Optional but Recommended)

In [the Producer Pal "Setup" tab](/guide/device#setup-tab), enable **Small Model
Mode**.

<img src="/img/small-model-mode.png" alt="Small model mode setting" width="375"/>

This provides a smaller, simpler interface optimized for small/local language
models.

## 5. Open the Chat UI

In the Producer Pal device's Main tab, click "Open Chat UI". The built-in chat
UI opens in a browser:

![Chat UI](/img/producer-pal-chat.png)

## 6. Configure Ollama

In the chat UI settings:

- Provider: **Ollama (local)**
- URL: `http://localhost:11434`
  - Use this default URL when everything runs on the same computer. Change
    `localhost` to run Ollama on a different computer. Consult
    [the user guide](/guide/chat-ui#local-ai-settings-ollama-lm-studio) for more
    info.
- Model: Your model name (e.g., `gemma4` or `qwen3.5`)

Click "Save".

<img src="/img/producer-pal-chat-settings-connection-ollama.png" alt="Ollama settings" width="500"/>

::: tip Ollama Model Aliases

If Producer Pal says a model like `qwen3.5` is not installed but you downloaded
`qwen3.5:9b`, that's because Ollama aliases work one way: `qwen3.5` resolves to
`qwen3.5:9b`, but not vice versa. Install `qwen3.5` in Ollama to create the
alias. It won't re-download the model.

:::

## 7. Connect

Click "Quick Connect" and say "connect to ableton":

![Producer Pal Chat UI conversation](/img/producer-pal-chat-conversation.png)

::: tip Local Model Limitations

Local models work best for simple tasks. Complex edits may require more capable
cloud models.

:::

<!-- TODO: Embed YouTube video walkthrough -->

## Model Compatibility

If the model responds with garbled text like `<|tool_call_start|>...` or says it
can't connect to Ableton, the model doesn't support tools. Try a different model
from the [tools category](https://ollama.com/search?c=tools).

## Local Model Tips

- **Set the context length high enough.** When you connect, Producer Pal sends a
  sizable set of instructions (roughly 9,000 tokens). Ollama's default context
  window (`num_ctx`, 4096) is too small and silently truncates them, which
  breaks tool use. Use **16k (16000) or higher** — set it per model in a
  Modelfile, or globally with the `OLLAMA_CONTEXT_LENGTH=16384` environment
  variable. Larger windows use more memory and can run slower, so experiment to
  find the balance.
- **Follow-up turns are often much faster.** The local engine automatically
  reuses its cached prompt prefix (your instructions and earlier messages)
  between turns, so it usually only has to process your newest message. The
  first turn after connecting is the slow one; later turns in the same
  conversation can be dramatically quicker. There's nothing to configure. The
  size of the speedup depends on the model — some keep the prefix stable across
  turns and benefit fully, while others reprocess each turn and see little gain.

## Troubleshooting

If it doesn't work, see the [Troubleshooting Guide](/support/troubleshooting).
