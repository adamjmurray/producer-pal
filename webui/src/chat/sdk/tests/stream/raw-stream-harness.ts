// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Drives the chat client over raw provider streams. The real AI SDK provider
 * parses recorded-shape server-sent events, the real `streamText` loop runs the
 * tools, and only `fetch` is stubbed. That checks the whole path from a
 * provider's chunks to chat history and back out as the next request.
 */
import { expect, vi } from "vitest";
import { ChatSdkClient } from "#webui/chat/sdk/client";
import { formatChatMessages } from "#webui/chat/sdk/formatter";
import { createProviderModel } from "#webui/chat/sdk/provider/provider-factories";
import { FAILING_TOOL, LIVE_SET_TOOL } from "./fake-mcp-tools";
import { type ChatMessage } from "#webui/chat/sdk/types";
import { type Provider } from "#webui/types/settings";

/** One provider event: a JSON object, or the literal `[DONE]` marker. */
export type RawEvent = Record<string, unknown> | "[DONE]";

/** What the stubbed `fetch` saw for one request. */
export interface SeenRequest {
  url: string;
  body: Record<string, unknown>;
}

/** What `fetch` answers one request with. */
export type Reply = Response | RawEvent[];

/**
 * Serialize one event as a server-sent event.
 * @param event - Provider event
 * @param named - Also write an `event: <type>` line, as OpenAI's Responses API
 *   and Anthropic do
 * @returns SSE text for the event
 */
function sseEvent(event: RawEvent, named: boolean): string {
  const type = typeof event === "object" ? (event.type as string) : undefined;
  const head = named && type ? `event: ${type}\n` : "";

  return `${head}data: ${event === "[DONE]" ? event : JSON.stringify(event)}\n\n`;
}

/**
 * Wrap events as an HTTP streaming response. Events arrive one per tick, as
 * they do over a network, so the client reads each before the next lands.
 * Handing over the whole body at once would let a later error outrun earlier
 * text.
 * @param events - Provider events in order
 * @param named - Write `event:` lines too
 * @returns A 200 `text/event-stream` response
 */
export function sseResponse(events: RawEvent[], named = false): Response {
  const encoder = new TextEncoder();
  let next = 0;

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      await new Promise((resolve) => setTimeout(resolve, 0));

      const event = events[next++];

      if (event == null) {
        controller.close();
      } else {
        controller.enqueue(encoder.encode(sseEvent(event, named)));
      }
    },
  });

  return new Response(body, {
    headers: { "content-type": "text/event-stream" },
  });
}

/**
 * A provider error answered before any stream starts.
 * @param status - HTTP status
 * @param body - JSON error body
 * @returns The response
 */
export function httpError(
  status: number,
  body: Record<string, unknown>,
): Response {
  return Response.json(body, { status });
}

/**
 * Stub `fetch` to answer successive requests with the given replies (then a
 * 500) and record what was asked.
 * @param replies - One reply per expected request
 * @param named - Write `event:` lines when a reply is a list of events
 * @returns The requests seen so far (the array fills as requests arrive)
 */
export function stubProviderFetch(
  replies: Reply[],
  named = false,
): SeenRequest[] {
  const seen: SeenRequest[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn((url: unknown, init?: RequestInit) => {
      const reply = replies[seen.length];

      seen.push({
        url: String(url),
        body: JSON.parse(init?.body as string) as Record<string, unknown>,
      });

      if (reply == null) {
        return Promise.resolve(new Response("{}", { status: 500 }));
      }

      return Promise.resolve(
        reply instanceof Response ? reply : sseResponse(reply, named),
      );
    }),
  );

  return seen;
}

/** Options for {@link startChat}. */
export interface ChatOptions {
  provider: Provider;
  model: string;
  baseUrl?: string;
  providerOptions?: ChatClientProviderOptions;
  chatHistory?: ChatMessage[];
  maxSteps?: number;
}

type ChatClientProviderOptions = NonNullable<
  ConstructorParameters<typeof ChatSdkClient>[1]["providerOptions"]
>;

/**
 * Build an initialized client on a real provider model.
 * @param options - Provider, model and optional config
 * @returns The client
 */
export async function startChat(options: ChatOptions): Promise<ChatSdkClient> {
  const client = new ChatSdkClient("test-key", {
    model: createProviderModel(
      options.provider,
      options.model,
      "test-key",
      options.baseUrl,
    ),
    providerOptions: options.providerOptions,
    chatHistory: options.chatHistory,
    maxSteps: options.maxSteps,
  });

  await client.initialize();

  return client;
}

/**
 * Send one user message and return the history as it ends.
 * @param client - Client from {@link startChat}
 * @param text - User message
 * @returns The final chat history
 */
export async function say(
  client: ChatSdkClient,
  text: string,
): Promise<ChatMessage[]> {
  let last: ChatMessage[] = [];

  for await (const history of client.sendMessage(text)) {
    last = history;
  }

  return last;
}

/**
 * The assistant turns of a history, without their timing (which depends on the
 * clock).
 * @param history - Chat history
 * @returns Assistant messages in order
 */
export function assistantTurns(history: ChatMessage[]): ChatMessage[] {
  return history
    .filter((m) => m.role === "assistant")
    .map((m) => {
      const turn = { ...m };

      delete turn.timing;

      return turn;
    });
}

/**
 * The ids and arguments of a step's calls, and the ids its results answer.
 * @param turn - An assistant turn
 * @returns Calls as `[id, args]` pairs, and result ids
 */
export function callsAndResults(turn: ChatMessage | undefined): {
  calls: Array<[string, Record<string, unknown>]>;
  resultIds: string[];
} {
  return {
    calls: (turn?.toolCalls ?? []).map((c) => [c.id, c.args]),
    resultIds: (turn?.toolResults ?? []).map((r) => r.id),
  };
}

/**
 * Check that history holds a failed `ppal-update-clip` step (the fixtures'
 * failing call) followed by the model's answer.
 * @param history - Chat history after a failing tool call and an answer
 */
export function expectFailedToolRun(history: ChatMessage[]): void {
  const [step, answer] = assistantTurns(history);

  expect(step?.toolResults?.[0]).toStrictEqual({
    id: step?.toolCalls?.[0]?.id,
    name: FAILING_TOOL,
    args: { id: "7" },
    result: "clip 7 not found",
    isError: true,
  });
  expect(answer?.content).toBe("Tempo is 120.");
}

/**
 * The call and result of the fixtures' successful `ppal-read-live-set` step.
 * @param id - The call id both entries carry
 * @returns `toolCalls` and `toolResults` to spread into a turn
 */
export function liveSetStep(
  id: unknown,
): Pick<ChatMessage, "toolCalls" | "toolResults"> {
  const args = { include: "t" };

  return {
    toolCalls: [{ id: id as string, name: LIVE_SET_TOOL, args }],
    toolResults: [
      {
        id: id as string,
        name: LIVE_SET_TOOL,
        args,
        result: [{ type: "text", text: "tempo 120" }],
        isError: false,
      },
    ],
  };
}

/**
 * Check that a send fails with the given message while keeping the text that
 * had streamed in before the failure.
 * @param client - Client whose stream fails partway
 * @param message - Text the thrown error must contain
 * @param partialText - Text the assistant turn must still hold
 */
export async function expectStreamFailure(
  client: ChatSdkClient,
  message: string,
  partialText: string,
): Promise<void> {
  await expect(say(client, "Tracks?")).rejects.toThrow(message);
  expect(assistantTurns(client.chatHistory)[0]?.content).toBe(partialText);
}

/**
 * Check that the first step of a history made the fixtures' two parallel calls
 * (`call_a` and `call_b`) and answered both.
 * @param history - Chat history after a parallel-call step
 */
export function expectParallelCalls(history: ChatMessage[]): void {
  expect(callsAndResults(assistantTurns(history)[0])).toStrictEqual({
    calls: [
      ["call_a", { include: "a" }],
      ["call_b", { include: "b" }],
    ],
    resultIds: ["call_a", "call_b"],
  });
}

/**
 * Check that the first step of a history made one call with no arguments, and
 * that it ran.
 * @param history - Chat history after a call with empty arguments
 */
export function expectEmptyArgsStep(history: ChatMessage[]): void {
  const [step] = assistantTurns(history);

  expect(step?.toolCalls?.[0]?.args).toStrictEqual({});
  expect(step?.toolResults?.[0]?.isError).toBe(false);
}

/**
 * The parts the chat view shows for the last message.
 * @param history - Chat history
 * @returns `[type, content]` pairs
 */
export function chatViewParts(history: ChatMessage[]): unknown[][] {
  const parts = formatChatMessages(history).at(-1)?.parts ?? [];

  return parts.map((p) => [p.type, "content" in p ? p.content : null]);
}

/**
 * Send a message and say whether the turn ended at the tool-step limit.
 * @param client - Client built with a `maxSteps` of 1
 * @param text - User message
 * @returns True when the limit cut off a model that still wanted tools
 */
export async function toolLimitReachedAfter(
  client: ChatSdkClient,
  text: string,
): Promise<boolean> {
  await say(client, text);

  return client.toolLimitReached;
}

/**
 * Answer the next request with an HTTP error, and check that sending fails
 * with the given message and leaves only the user's turn in history.
 * @param start - Builds the client
 * @param status - HTTP status
 * @param body - JSON error body
 * @param message - Text the thrown error must contain
 */
export async function expectHttpFailure(
  start: () => Promise<ChatSdkClient>,
  status: number,
  body: Record<string, unknown>,
  message: string,
): Promise<void> {
  stubProviderFetch([httpError(status, body)]);

  const client = await start();

  await expect(say(client, "Tracks?")).rejects.toThrow(message);
  expect(client.chatHistory).toStrictEqual([
    { role: "user", content: "Tracks?" },
  ]);
}

/**
 * Collect the AI SDK's warnings instead of logging them. Call
 * {@link restoreSdkWarnings} afterwards.
 * @returns The warnings seen so far, as text (the array fills as they arrive)
 */
export function collectSdkWarnings(): string[] {
  const seen: string[] = [];

  globalThis.AI_SDK_LOG_WARNINGS = ({ warnings }) => {
    for (const w of warnings) {
      seen.push(JSON.stringify(w));
    }
  };

  return seen;
}

/** Put the AI SDK's default warning logging back. */
export function restoreSdkWarnings(): void {
  globalThis.AI_SDK_LOG_WARNINGS = undefined;
}

/** The notice the chat adds when a content filter ends a reply. */
export const FILTER_NOTICE =
  "The provider stopped this reply because of its content filter. Use Retry, or edit your message and rephrase it.";
