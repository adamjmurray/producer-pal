# Voice Mode

Part of the [Chat UI docs](README.md).

Voice mode is a realtime speech-to-speech conversation with the model, reached
by selecting a realtime model (`App.tsx` routes to `VoiceApp` via
`isRealtimeSelection`). The provider is derived from the model id
(`gpt-realtime-2.1` → OpenAI, `gemini-3.8-live` → Gemini). It reuses the chat
conversation store, transcript rendering, and MCP tools — only the transport and
audio handling are new.

**Hook orchestration:** `use-voice-mode-state.ts` composes the whole voice hook
graph and picks the backend from the selected model, exposing a single
`UseVoiceSessionReturn` interface so `VoiceApp` is provider-agnostic:

```
VoiceApp.tsx
  └─> useVoiceModeState()                  → orchestrates + routes by provider
        ├─> useVoiceSession()              → OpenAI Realtime over WebRTC
        │     (@openai/agents SDK owns mic capture, VAD, playback)
        ├─> useGeminiVoiceSession()        → Gemini Live over WebSocket
        │     ├─> GeminiMicCapture         → getUserMedia → AudioWorklet → 16 kHz PCM
        │     ├─> GeminiPcmPlayer          → gapless 24 kHz PCM playback
        │     └─> GeminiHistoryBuilder     → WS deltas → RealtimeItem[]
        └─> useVoicePersistence()          → IndexedDB autosave (shared store)
```

**Two backends, one interface.** OpenAI leans on the `@openai/agents` Realtime
SDK (the SDK owns the audio path); Gemini Live is handled explicitly because the
WebSocket transport carries raw PCM — mic audio is captured through an
AudioWorklet and posted as 16 kHz PCM, and the model's 24 kHz PCM replies are
scheduled gaplessly by `GeminiPcmPlayer`. Both backends return the same shape so
the rest of voice mode doesn't branch on provider.

**Reused from chat:** voice history is converted to chat `UIMessage`s by
`realtime-items-to-ui-messages.ts` and rendered with the same `MessageList`;
conversations persist to the same IndexedDB store with a `sessionType: "voice"`
discriminant and use the shared `ConversationPanel`; MCP tools are dispatched
through `voice-mcp-call.ts` (a 60s-timeout wrapper that returns errors as text
rather than throwing), wrapped per provider by `realtime-mcp-tools.ts` (OpenAI)
and `gemini-mcp-tools.ts` (Gemini).

**Credentials.** The browser never holds the long-lived API key for the realtime
connection. Two Express routes on the MCP server mint or relay credentials
server-side, both gated to local origins:

- `POST /voice-token`
  ([routes/voice/voice-token-route.ts](../../../src/mcp-server/routes/voice/voice-token-route.ts))
  forwards the user's OpenAI key to OpenAI's `client_secrets` endpoint
  server-to-server and returns only the short-lived `ek_...` ephemeral token.
- `POST /gemini-voice-token`
  ([routes/voice/gemini-voice-token-route.ts](../../../src/mcp-server/routes/voice/gemini-voice-token-route.ts))
  currently returns the Gemini key as-is (`ephemeral: false`), since Gemini Live
  accepts the API key directly from the browser. A server-only upgrade path to
  v1alpha ephemeral tokens exists; the client already honors the `ephemeral`
  flag.
