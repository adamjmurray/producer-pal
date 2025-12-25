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

- `gemini-flash.spec.mjs` - Tests Quick Connect with Gemini 3 Flash provider
- `openai-gpt5.spec.mjs` - Tests Quick Connect with OpenAI GPT-5.2 provider
