# Ollama

Run Producer Pal completely offline with local models.

## What You Need

- [Ollama](https://ollama.com/) installed
- [Ableton Live 12.2+](https://www.ableton.com/live/) with
  [Max for Live](https://www.ableton.com/live/max-for-live/)

## 1. Install Ollama

Download and install [Ollama](https://ollama.com/) for your operating system.

## 2. Download a Model

Download a model that supports tools. Good options:

- `qwen3:8b` - Good balance of speed and quality
- `llama3.3:70b` - Higher quality but requires more RAM

Browse [models with tool support](https://ollama.com/search?c=tools) on the
Ollama website.

## 3. Install the Max for Live Device

Download
[Producer_Pal.amxd](https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.amxd)
and drag it to a MIDI track in Ableton Live.

It should display "Producer Pal Running":

![Producer Pal device running in Ableton Live](/device-main-tab.png)

## 4. Enable Small Model Mode

In the Producer Pal "Setup" tab, check **Small Model Mode**. This simplifies
tool descriptions for better compatibility with local models.

## 5. Open the Chat UI

In the Producer Pal device, click "Open Chat UI".

## 6. Configure Ollama

In the chat UI settings:

- Provider: **Ollama (local)**
- Port: `11434` (default)
- Model: Your model name (e.g., `qwen3:8b`)

Click "Save".

## 7. Connect

Click "Quick Connect" and say "connect to ableton":

![Producer Pal Chat UI](/built-in-chat-ui.png)

::: tip Local Model Limitations

Local models work best for simple tasks. Complex edits may require more capable
cloud models.

:::

<!-- TODO: Embed YouTube video walkthrough -->

## Model Compatibility

If the model responds with garbled text like `<|tool_call_start|>...` or says it
can't connect to Ableton, the model doesn't support tools. Try a different model
from the [tools category](https://ollama.com/search?c=tools).

## Troubleshooting

If it doesn't work, see the [Troubleshooting Guide](./troubleshooting).
