# Running Producer Pal Locally / Offline

Run AI models entirely on your machine with no cloud dependency or subscription.
Requires a relatively capable machine: Apple Silicon with lots of RAM, or a PC
with a capable Nvidia GPU (8GB VRAM minimum, 4080+ recommended).

## Options

| Option             | Best For             | Trade-offs                                   |
| ------------------ | -------------------- | -------------------------------------------- |
| [Ollama](./ollama) | Easiest local setup  | Uses Built-in Chat UI. Model quality varies. |
| [Bionic](./bionic) | GUI model management | Standalone app, more configuration options.  |

## Recommendation

**Ollama with the Built-in Chat UI** is the simplest local setup.

## Model Notes

- Local models are significantly less capable than cloud models for complex
  musical tasks
- Best for: simple clip creation, basic playback control, experimentation
- Challenging for: multi-step arrangements, complex notation, nuanced musical
  decisions
- Recommended models: Qwen, Gemma, Mistral, Nemotron

## Hardware Requirements

- **Apple Silicon:** Lots of unified memory helps run larger models
- **Nvidia:** 4080+ recommended
  - Minimum: 8GB VRAM, runs 7B-13B models
  - Recommended: 16GB+ VRAM for 30B+ models
  - Optimal: 24GB+ VRAM for 70B models
