# Running Producer Pal Locally / Offline

Run AI models entirely on your machine with no cloud dependency or subscription.
Requires a capable GPU (8GB+ VRAM recommended).

## Options

| Option                   | Best For             | Trade-offs                                   |
| ------------------------ | -------------------- | -------------------------------------------- |
| [Ollama](./ollama)       | Easiest local setup  | Uses Built-in Chat UI. Model quality varies. |
| [LM Studio](./lm-studio) | GUI model management | Standalone app, more configuration options.  |

## Recommendation

**Ollama with the Built-in Chat UI** is the simplest local setup.

## Model Notes

- Local models are significantly less capable than cloud models for complex
  musical tasks
- Best for: simple clip creation, basic playback control, experimentation
- Challenging for: multi-step arrangements, complex notation, nuanced musical
  decisions
- Recommended models: Qwen 2.5 32B, Llama 3.3 70B (if hardware permits)

## Hardware Requirements

- **Minimum:** 8GB VRAM, runs 7B-13B models
- **Recommended:** 16GB+ VRAM for 30B+ models
- **Optimal:** 24GB+ VRAM for 70B models
