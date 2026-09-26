# AI SDK Integration

How the chat UI talks to AI providers and the MCP server. Part of the
[Chat UI docs](README.md).

**Health Checking:**

`useMcpConnection` hook checks server availability on mount and provides retry
functionality. Auto-retries on first message if connection failed initially.

**Streaming:**

The UI uses the Vercel AI SDK's `streamText()` to stream responses from any
supported provider:

```typescript
const result = streamText({ model, messages, tools, ... });
for await (const part of result.fullStream) {
  // Handle: text-delta, reasoning-delta, tool-call, tool-result, start-step
}
```

All providers (Anthropic, Google, OpenAI, Mistral, OpenRouter, Ollama) go
through this single code path via provider-specific model factories in
`provider-factories.ts`.

**Locked Settings:**

Provider, model, thinking level, small-model mode, the resolved system
instruction, notation, and the toolset (`enabledTools`) are locked per
conversation. When a conversation is saved, these settings are stored on the
`ConversationRecord`. When restored, they're passed as
`ConversationLockedSettings` to prevent settings changes from affecting the
active conversation.

Notation is hard-locked rather than re-read per init: it decides how clip notes
are PARSED, so a transcript written in one notation must keep being read in it.

The toolset is locked for the matching reason on the writing side: a transcript
full of successful calls to a tool is itself an instruction to keep calling it,
so withdrawing that tool mid-conversation invites a call the client can no
longer route. Records saved before the toolset was locked have none, and fall
back to the current selection.

The Direct Live API tool needs `withLiveApiTool` to make that lock hold. Its
Tools-tab checkbox writes no map entry — it flips the device-global
`liveApiEnabled`, which adds or removes the tool from the server's catalog — so
the flag is stamped into the map before it is locked. Every site that compares a
locked toolset against the current one must stamp BOTH sides, or a conversation
locked while the tool was off reports a divergence for the rest of its life.
Nothing enforces this. Two sites compare today — the header's tools indicator
and the Settings modal's locked-settings notice — and the notice shipped missing
the stamp, so treat a new comparison site as a place to get this wrong.

Per-message overrides (`MessageOverrides`) can still override thinking for
individual messages. When used, the overridden value is stamped on the assistant
`ChatMessage` as `thinkingOverride` — only when it differs from the conversation
default.

**Response Model Tracking:**

After each stream completes, `ai-sdk-client.ts` captures the `modelId` from the
API response metadata and stores it on the assistant `ChatMessage` as
`responseModel`. This persists to IndexedDB automatically (optional field, no
migration needed).

When the response model differs meaningfully from the requested model — after
normalizing org prefixes and date suffixes — `MessageList.tsx` shows a
"responded as {model}" label on the message bubble. This surfaces provider
routing surprises (e.g., OpenRouter fallbacks, Ollama aliases).

Mismatch detection logic is in `chat/helpers/model-identity.ts`. To test: use
OpenRouter with the `openrouter/auto` model, which auto-selects a model and
always triggers the mismatch indicator.

**Tool catalog vs. MCP catalog:**

`fullToolCatalog` (`lib/utils/tool-catalog.ts`) is every tool the user can
switch on: the MCP `listTools` response plus placeholders for any experimental
tool missing from it. Two are: `spawn_subagent` never appears (it's
client-side), and `ppal-live-api` only while the device flag is on —
deliberately, since `listTools` is what every MCP client offers its model, so a
withheld tool must not be listed.

The Tools tab and the header's `x/y` indicator both count against this catalog,
not the MCP response. That keeps the denominator still while the two opt-in
tools move, so the fraction means "how much of the full set am I running" — it
reads 21/23 out of the box, and the indicator's tooltip says why. Counting uses
`isToolEnabled`, since absent means enabled for ordinary tools but disabled for
`spawn_subagent`.

**Subagents:**

`spawn_subagent` is a client-side tool (no `ppal-` prefix, never in the MCP tool
list): it runs a nested `ChatSdkClient` in the browser, because a worker needs
the decrypted API key the server never sees. `buildWorkerConfig` clones the
orchestrator config — layering a chosen "Subagent preset" over it — and always
re-strips `spawn_subagent` as the recursion guard.

A worker's system instruction then gets a **briefing** appended: the Live Set
overview, the skills for its toolset and notation, and the user's context
layers, fetched once from `GET /subagent-briefing`
(`subagent/subagent-briefing.ts`). That replaces the `ppal-connect` call each
worker used to make, so `ppal-connect` and `ppal-context` are withheld from a
briefed worker. If the briefing can't be fetched, `ppal-connect` comes back and
the worker bootstraps itself as before; `ppal-context` stays withheld either
way, since it's withheld to keep parallel workers off the user's context store
rather than because the briefing replaced it — see the Architecture doc →
Subagent briefings for why the blob belongs in the system prompt.

**Formatting:**

`formatter.ts` transforms the stream into UI-friendly format:

- Merges consecutive assistant messages into single UI messages
- Converts to typed parts: `text`, `image`, `thought`, `tool`, `error`
- Matches tool results to tool calls by ID
- Tracks original indices for retry functionality
