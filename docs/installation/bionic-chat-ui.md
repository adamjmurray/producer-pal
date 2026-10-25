# Bionic / LM Studio in the Built-in Chat UI

Run the AI in Bionic / LM Studio and chat in Producer Pal's built-in chat
window: free, private and offline. Prefer Bionic's own chat window? See
[Bionic / LM Studio as a desktop app](./bionic).

::: warning Needs a powerful computer

Local AI needs an Apple Silicon Mac with lots of memory, or a PC with a strong
Nvidia graphics card. See [Running Locally](./choose-local) to check yours.

:::

This guide is for Bionic. The older LM Studio app also works: its menus differ,
but the settings are the same.

## What You Need

<!--@include: ../_partials/live-requirement.md-->

- [Bionic](https://lmstudio.ai/bionic) (free, no account needed)

## 1. Install the Max for Live Device

<!--@include: ../_partials/device-steps.md-->

## 2. Download a Model

Download a model in Bionic under Settings &rarr; Explore, such as a recent
version of Qwen, Gemma, Mistral, or Nemotron. If your computer can handle it, a
bigger version of a model is smarter.

It has to support tools. Your downloaded models are listed under Settings &rarr;
Library, where a hammer icon marks the ones that do:

<img src="/img/bionic-tool-icon.png" alt="The hammer icon marks a model that supports tools" width="400"/>

## 3. Turn On Bionic's Local Server

Go to Settings &rarr; Local Model API and turn on:

- **Local API server** - It should then read "Running"
- **CORS** - lets your browser talk to Bionic

Copy the **Base URL** while you're here (`http://localhost:1234/v1` by default —
use "Edit port" to change it):

![Bionic's Local Model API settings](/img/bionic-server-settings.png)

## 4. Load the Model

Either turn on **Just-in-time model loading** so requests load one on demand, or
preload a model by having a quick chat with it in Bionic first — which is also a
good way to confirm it works. Loaded models are listed under Settings &rarr;
Loaded Instances:

![A loaded model instance in Bionic](/img/bionic-loaded-instances.png)

Set the model's **context length to 16k (16000) or higher**. This is how much
the AI can keep in mind at once, and Producer Pal's instructions need the room.

## 5. Turn On Small Model Mode (Recommended)

In the device's [Setup tab](/guide/device#setup-tab), turn on **Small Model
Mode**. It gives local AI a simpler set of tools.

<img src="/img/small-model-mode.png" alt="Small model mode setting" width="375"/>

## 6. Connect

1. In the device, click "Open Chat UI". In its settings:
   - Provider: **Bionic / LM Studio (local)**
   - URL: The Base URL you copied
   - Model: A model that supports tools, such as `qwen/qwen3.8-27b`,
     `google/gemma-4-e4b`, `mistralai/devstral-small-2-2512`, or
     `zai-org/glm-4.7-flash`
2. Click "Save", then "Quick Connect". It says "Connect to Ableton." for you.

More ways to get good results: [Local Model Tips](./bionic#local-model-tips).

## Troubleshooting

- **Garbled text like `<|tool_call_start|>...`, or it says it can't connect to
  Ableton:** the model can't use tools. Pick one with the hammer icon (step 2).
- **The server isn't behaving:** turn on **Verbose logs** under Settings &rarr;
  Local Model API, then read **Server logs** on the same page.

For anything else, see the [Troubleshooting Guide](/support/troubleshooting).
