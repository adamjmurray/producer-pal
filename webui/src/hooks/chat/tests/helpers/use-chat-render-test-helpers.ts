// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  act,
  renderHook,
  type RenderHookResult,
} from "@testing-library/preact";
import { useChat } from "#webui/hooks/chat/use-chat";
import {
  type ConversationLockedSettings,
  type UseChatProps,
  type UseChatReturn,
} from "#webui/hooks/chat/use-chat-types";
import {
  tick,
  type MockChatClient,
  type TestConfig,
  type TestMessage,
} from "./use-chat-test-helpers";

/** useChat props as produced by `createDefaultProps` (mock-adapter flavored) */
export type MockChatProps = UseChatProps<
  MockChatClient,
  TestMessage,
  TestConfig
>;

/** The `renderHook` handle for a mock-adapter useChat render */
export type ChatRender = RenderHookResult<UseChatReturn, MockChatProps>;

/** The stable `{ current }` handle exposing the latest useChat return value */
export type ChatResult = ChatRender["result"];

/**
 * Render useChat with the given props. The hook is rendered through an
 * initialProps callback so `rerender(nextProps)` works (e.g. to simulate the
 * user adding an API key in Settings mid-conversation).
 * @param props - Full useChat props (commonly `{ ...defaultProps, ...overrides }`)
 * @returns The renderHook handle
 */
export function renderChat(props: MockChatProps): ChatRender {
  return renderHook((p: MockChatProps) => useChat(p), { initialProps: props });
}

/**
 * Send a message through the hook, wrapped in `act`.
 * @param result - The rendered useChat result handle
 * @param message - The message text to send
 */
export async function sendMessage(
  result: ChatResult,
  message = "Hello",
): Promise<void> {
  await act(async () => {
    await result.current.handleSend(message);
  });
}

/**
 * Render useChat and send a single message, awaiting the full turn.
 * @param props - Full useChat props
 * @param message - The message text to send
 * @returns The renderHook handle, after the turn completes
 */
export async function renderAndSend(
  props: MockChatProps,
  message = "Hello",
): Promise<ChatRender> {
  const rendered = renderChat(props);

  await sendMessage(rendered.result, message);

  return rendered;
}

/**
 * Index of the first displayed user message (-1 when there is none).
 * @param result - The rendered useChat result handle
 * @returns The merged-message index of the first user message
 */
export function userMessageIndex(result: ChatResult): number {
  return result.current.messages.findIndex((m) => m.role === "user");
}

/**
 * Index of the first displayed model message (-1 when there is none).
 * @param result - The rendered useChat result handle
 * @returns The merged-message index of the first model message
 */
export function modelMessageIndex(result: ChatResult): number {
  return result.current.messages.findIndex((m) => m.role === "model");
}

/**
 * Retry the turn at the given merged-message index, wrapped in `act`.
 * @param result - The rendered useChat result handle
 * @param index - The merged-message index to retry from
 */
export async function retryAt(
  result: ChatResult,
  index: number,
): Promise<void> {
  await act(async () => {
    await result.current.handleRetry(index);
  });
}

/**
 * Retry from the first displayed user message.
 * @param result - The rendered useChat result handle
 * @returns The index that was retried from
 */
export async function retryFromUserMessage(
  result: ChatResult,
): Promise<number> {
  const index = userMessageIndex(result);

  await retryAt(result, index);

  return index;
}

/**
 * Edit the message at the given merged-message index, wrapped in `act`.
 * @param result - The rendered useChat result handle
 * @param index - The merged-message index to edit
 * @param newMessage - Replacement text
 */
export async function editAt(
  result: ChatResult,
  index: number,
  newMessage: string,
): Promise<void> {
  await act(async () => {
    await result.current.handleEdit(index, newMessage);
  });
}

/**
 * Restore a conversation's chat history, wrapped in `act`.
 * @param result - The rendered useChat result handle
 * @param history - The history to restore
 * @param locked - Optional locked settings for the restored conversation
 */
export async function restoreHistory(
  result: ChatResult,
  history: TestMessage[],
  locked?: ConversationLockedSettings,
): Promise<void> {
  await act(async () => {
    result.current.restoreChatHistory(history, locked);
  });
}

/**
 * Clear the conversation, wrapped in `act`.
 * @param result - The rendered useChat result handle
 */
export async function clearConversation(result: ChatResult): Promise<void> {
  await act(async () => {
    result.current.clearConversation();
  });
}

/**
 * Stop the in-flight response, wrapped in `act`.
 * @param result - The rendered useChat result handle
 */
export async function stopResponse(result: ChatResult): Promise<void> {
  await act(async () => {
    result.current.stopResponse();
  });
}

/**
 * Whether any displayed message carries an error part.
 * @param result - The rendered useChat result handle
 * @returns True when an error part is rendered
 */
export function hasErrorPart(result: ChatResult): boolean {
  return result.current.messages.some((m) =>
    m.parts.some((p) => p.type === "error"),
  );
}

/**
 * Text content of the first displayed message with the given role, or undefined
 * when the message/part carries no `content`.
 * @param result - The rendered useChat result handle
 * @param role - The message role to look for
 * @returns The first part's text content
 */
export function firstPartContent(
  result: ChatResult,
  role: "user" | "model",
): string | undefined {
  const part = result.current.messages.find((m) => m.role === role)?.parts[0];

  return part != null && "content" in part ? part.content : undefined;
}

/**
 * Kick off a send that will hit a rate limit, wait for the retry delay to
 * begin, then stop the response mid-delay and let the send unwind.
 * @param result - The rendered useChat result handle
 * @param message - The message text to send
 */
export async function sendThenStopDuringRetryDelay(
  result: ChatResult,
  message = "Hello",
): Promise<void> {
  // Start send but don't await — it will enter the retry delay.
  const sendPromise = act(async () => {
    await result.current.handleSend(message);
  });

  // Give time for the rate limit to be detected and retry delay to start.
  await new Promise((resolve) => setTimeout(resolve, 50));

  await act(async () => {
    result.current.stopResponse();
  });

  // Wait for send to complete (it should exit due to the abort).
  await sendPromise;
}

/**
 * Start a turn, stop it while it's still in flight, then start a newer one.
 * This is the overlap window where a superseded turn and its replacement share
 * a client and an abort ref.
 * @param result - The rendered useChat result handle
 * @returns The stopped turn's send promise, still pending — await it to unwind
 */
export async function supersedeInFlightTurn(
  result: ChatResult,
): Promise<{ stoppedSend: Promise<void> }> {
  const stoppedSend = act(async () => {
    await result.current.handleSend("first");
  });

  await tick();
  await stopResponse(result);
  void act(() => {
    void result.current.handleSend("second");
  });
  await tick();

  return { stoppedSend };
}
