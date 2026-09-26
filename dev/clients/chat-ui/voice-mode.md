# Voice Mode

Part of the [Chat UI docs](README.md).

Voice mode is a realtime speech-to-speech conversation with the model, reached
by selecting a realtime model (`App.tsx` routes to `VoiceApp` via
`isRealtimeSelection`). It reuses the chat conversation store, transcript
rendering, and MCP tools — only the transport and audio handling are new.

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

**Credentials** are minted/relayed by two server routes (`POST /voice-token`,
`POST /gemini-voice-token`) so the long-lived key stays off the browser for the
OpenAI path; see [the Architecture doc](../../architecture/README.md#voice-mode)
for the server side.
