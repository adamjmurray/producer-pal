# Chat UI Playwright Tests

End-to-end tests for the built-in Producer Pal chat UI.

## Prerequisites

These tests require a fully running Producer Pal setup:

1. **Build the project**: `npm run build:all`
2. **Ableton Live running** with the Producer Pal device active
3. **API keys** in `.env` file (e.g., `GEMINI_KEY`, `OPENAI_KEY` or
   `OPENAI_API_KEY`)

## Running Tests

```bash
# Run tests in headless mode
npm run ui:test

# Run tests with UI mode (for debugging)
npm run ui:test:dev

# Run tests with visible browser
npm run ui:test:headed
```

## Why These Tests Don't Run in CI

These tests depend on:

- A real Ableton Live instance running
- The Producer Pal Max for Live device being active
- MCP connection between the chat UI and the device

This makes them suitable only for local QA testing, not automated CI.

## Test Files

- `quick-connect.spec.ts` - Tests Quick Connect across multiple providers/models
  (includes all OpenRouter models automatically)

## Adding New Provider/Model Tests

Edit `quick-connect.spec.ts` and add a new entry to `TEST_CONFIGS`:

```typescript
{
  provider: "mistral",           // Value for provider select
  providerLabel: "Mistral",      // Display name for test output
  model: "mistral-large-latest", // Value for model select
  modelLabel: "Mistral Large",   // Display name for test output
  envKey: "MISTRAL_KEY",         // Env var for API key
},
```

OpenRouter models are automatically imported from `OPENROUTER_MODELS` in
`webui/src/components/settings/controls/ModelSelector.tsx` and tested with
`OPENROUTER_KEY`.
