# Stream Record & Playback Testing

## Goal

Capture real AI SDK `fullStream` events from live provider interactions and
replay them in unit tests. This validates the full pipeline — stream processing,
message accumulation, and UI formatting — against actual provider behavior
without API calls.

## Why

Current tests mock `streamText()` with hand-crafted event sequences. This works
well for logic coverage but can't catch:

- **Provider quirks** — empty deltas, unusual event ordering, partial JSON in
  tool args, provider-specific reasoning formats
- **SDK format changes** — if the AI SDK changes event structure after an
  update, hand-crafted mocks won't catch it
- **Multi-step tool call complexity** — real conversations with multiple tool
  calls across steps are hard to craft by hand and easy to get wrong

## Architecture

### What to Record

Record raw `fullStream` parts — the lowest-level, lossless format. Each part is
a plain object with a `type` field and associated data:

```typescript
interface RecordedStreamPart {
  type: string;
  [key: string]: unknown;
}

interface RecordedSession {
  provider: string;
  model: string;
  recordedAt: string;
  turns: RecordedTurn[];
}

interface RecordedTurn {
  userMessage: string;
  streamParts: RecordedStreamPart[];
}
```

This captures everything needed to replay through both the webui
(`AiSdkClient.processStream()`) and evals (`processCliStream()`) pipelines.

### Where to Record

Add a `--record <path>` flag to `scripts/chat` (the CLI chat tool). This is the
simplest interception point:

1. The evals `processCliStream()` already iterates `fullStream` parts
2. Add a recording wrapper that saves each part to an array
3. Write the session JSON to disk when the chat ends

```
scripts/chat -p anthropic -1 --record recordings/anthropic-tool-call.json "list tracks"
```

The chat CLI already supports all providers and connects to a live MCP server,
so recordings naturally include real tool call/result sequences.

### Where to Replay

Create a `createMockStreamFromRecording()` helper that reads a recorded session
and returns a mock `streamText` result:

```typescript
function createMockStreamFromRecording(recording: RecordedTurn): {
  fullStream: AsyncIterable<Record<string, unknown>>;
} {
  return {
    async *fullStream() {
      for (const part of recording.streamParts) {
        yield part;
      }
    },
  };
}
```

This plugs directly into the existing test patterns — both `AiSdkClient` and
`processCliStream()` consume `fullStream` as an async iterable.

### Test Structure

Tests using recordings go in `webui/src/chat/ai-sdk/tests/` alongside existing
tests:

```
webui/src/chat/ai-sdk/tests/
  recordings/                          # recorded session JSON files
    anthropic-tool-call.json
    gemini-thinking.json
    openai-multi-step.json
    openrouter-reasoning.json
  recorded-streams.test.ts             # replay tests
```

Each test replays a recording through the full pipeline and asserts on the
resulting `UIMessage[]` structure:

```typescript
it("formats Anthropic tool call stream correctly", async () => {
  const recording = loadRecording("anthropic-tool-call.json");
  const messages = await replayThroughClient(recording.turns[0]);
  const uiMessages = formatAiSdkMessages(messages);

  // Assert structure
  expect(uiMessages).toHaveLength(2); // user + assistant
  const assistant = uiMessages[1];
  expect(assistant.parts.some((p) => p.type === "tool")).toBe(true);
});
```

### What to Assert

Recordings are snapshots of provider behavior at a point in time. Tests should
assert on **structural properties**, not exact content (which varies per call):

- Message count and roles
- Part types present (text, thought, tool)
- Tool call names and argument keys
- Tool results are attached (not null)
- No error parts unless expected
- Thought parts appear before text parts
- Consecutive assistant messages merge correctly

## Recording Scenarios

Priority recordings that cover the most important provider behaviors:

| Provider   | Scenario              | Key Events                              |
| ---------- | --------------------- | --------------------------------------- |
| Anthropic  | Tool call + text      | text-delta, tool-call, tool-result      |
| Anthropic  | Extended thinking     | reasoning-delta, text-delta             |
| Gemini     | Thinking + tool call  | reasoning-delta, tool-call, tool-result |
| OpenAI     | Multi-step tool calls | tool-call, tool-result, start-step      |
| OpenRouter | Reasoning model       | reasoning-delta, text-delta             |
| Any        | Text-only (no tools)  | text-delta only                         |
| Any        | Error mid-stream      | partial events then error               |

## Implementation Steps

### Phase 1: Recording Infrastructure

1. Add `RecordedSession` / `RecordedTurn` types to a shared location
   (`evals/chat/shared/types.ts` or new file)
2. Create a recording wrapper for `processCliStream()` that captures parts
3. Add `--record <path>` flag to `scripts/chat`
4. Test with one provider, verify the JSON output is complete and replayable

### Phase 2: Replay in Tests

5. Create `createMockStreamFromRecording()` test helper
6. Create `loadRecording()` utility (reads JSON, validates shape)
7. Write first replay test for one recording
8. Add structural assertion helpers (check part types, tool matching, etc.)

### Phase 3: Provider Coverage

9. Record sessions for each provider/scenario from the table above
10. Add replay tests for each recording
11. Document the recording process so new recordings can be added when providers
    change behavior

## Considerations

- **Recording size**: A typical tool-call conversation produces ~50-200 stream
  parts. JSON files will be small (5-20 KB each).
- **Sensitive data**: Recordings may contain API-generated content. Don't
  include API keys. Tool results from MCP will contain Live Set data — use a
  test Live Set.
- **Staleness**: Recordings become stale as providers update. Date each
  recording and re-record periodically or when tests start failing after SDK
  updates.
- **Not a replacement**: This complements hand-crafted mocks, doesn't replace
  them. Hand-crafted mocks are better for testing specific edge cases and error
  paths. Recorded streams test the happy path with real data.
