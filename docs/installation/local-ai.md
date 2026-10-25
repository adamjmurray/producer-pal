# Local AI

Run the AI on your own computer and chat in Producer Pal's built-in chat window:
free, private and offline, but less smart than online AI. Two apps can run it:
[Ollama](#ollama) (the easiest) or [Bionic / LM Studio](#bionic-lm-studio).

<!--@include: ../_partials/local-ai-warning.md-->

## What You Need

<!--@include: ../_partials/live-requirement.md-->

## 1. Install the Max for Live Device

<!--@include: ../_partials/device-steps.md-->

## 2. Set Up Ollama or Bionic / LM Studio

Pick one.

### Ollama

1. Download and install [Ollama](https://ollama.com/download).
2. Download a model that can control other apps (Ollama calls this "tools"),
   such as `qwen3.8`, `gemma4`, `muse-glimmer` or `mistral-small3.2`. Open
   Terminal (Mac) or Command Prompt (Windows), type this and press Enter:

   ```
   ollama pull qwen3.8
   ```

   Swap in another name to get a different model. If your computer can handle
   it, a bigger version of a model is smarter. Browse more
   [models that support tools](https://ollama.com/search?c=tools).

3. Open the Ollama app's settings and set **Context length** to **16k or
   higher**. Producer Pal's instructions don't fit in the default, and the AI
   can't use Producer Pal without them. (Running Ollama without the app? Set
   `OLLAMA_CONTEXT_LENGTH=16384` instead.)
4. Settings to use in step 4:
   - Provider: **Ollama (local)**
   - URL: leave it as `http://localhost:11434` (to run Ollama on another
     computer, see
     [the user guide](/guide/chat-ui#local-ai-settings-ollama-bionic))
   - Model: the name you downloaded, like `qwen3.8`

<img src="/img/producer-pal-chat-settings-connection-ollama.png" alt="Ollama settings" width="500"/>

### Bionic / LM Studio

This is for Bionic. The older LM Studio app also works: its menus differ, but
the settings are the same. Prefer Bionic's own chat window? See
[Bionic / LM Studio as a desktop app](./bionic).

1. Install [Bionic](https://lmstudio.ai/bionic) (free, no account needed).
2. Download a model under Settings &rarr; Explore, such as a recent version of
   Qwen, Gemma, Mistral, or Nemotron. It has to support tools: under Settings
   &rarr; Library, a hammer icon marks the ones that do:

   <img src="/img/bionic-tool-icon.png" alt="The hammer icon marks a model that supports tools" width="400"/>

3. Go to Settings &rarr; Local Model API and turn on **Local API server** (it
   should then read "Running") and **CORS** (lets your browser talk to Bionic).
   Copy the **Base URL** while you're here (`http://localhost:1234/v1` by
   default):

   ![Bionic's Local Model API settings](/img/bionic-server-settings.png)

4. Turn on **Just-in-time model loading**, or load a model by having a quick
   chat with it in Bionic first. Set its **context length to 16k (16000) or
   higher**. Loaded models are listed under Settings &rarr; Loaded Instances:

   ![A loaded model instance in Bionic](/img/bionic-loaded-instances.png)

5. Settings to use in step 4:
   - Provider: **Bionic / LM Studio (local)**
   - URL: the Base URL you copied
   - Model: a model that supports tools, such as `qwen/qwen3.8-27b`,
     `google/gemma-4-e4b`, `mistralai/devstral-small-2-2512`, or
     `zai-org/glm-4.7-flash`

## 3. Turn On Small Model Mode (Recommended)

<!--@include: ../_partials/small-model-mode.md-->

## 4. Connect

<!--@include: ../_partials/chat-ui-connect.md-->

## Tips

<!--@include: ../_partials/local-model-tips.md-->

## Troubleshooting

- **Garbled text like `<|tool_call_start|>...`, or it says it can't connect to
  Ableton:** the model can't use tools. Pick another one from Ollama's
  [tools list](https://ollama.com/search?c=tools), or one with Bionic's hammer
  icon.
- **Ollama says the model isn't installed, but you downloaded it:** enter the
  full name, including the part after the colon (like `muse-glimmer:30b-mlx`).
  Type `ollama list` in Terminal to see the exact names.
- **Bionic's server isn't behaving:** turn on **Verbose logs** under Settings
  &rarr; Local Model API, then read **Server logs** on the same page.
- **The first reply is slow:** that's normal. Later replies in the same chat are
  usually much faster.

For anything else, see the [Troubleshooting Guide](/support/troubleshooting).
