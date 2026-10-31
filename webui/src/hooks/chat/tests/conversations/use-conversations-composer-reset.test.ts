// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import "fake-indexeddb/auto";
import { act } from "@testing-library/preact";
import { beforeEach, describe, expect, it } from "vitest";
import { saveConversation } from "#webui/lib/conversation-db";
import { createTestRecord } from "#webui/test-utils/conversation-test-helpers";
import {
  fireHashChange,
  resetConversationsTestState,
  saveWithMessage,
  waitForEffects,
  setupConversationsHook as setupHook,
} from "./use-conversations-test-helpers";

/**
 * Save a one-message conversation to switch to.
 * @returns Its id
 */
async function saveOther(): Promise<string> {
  const id = crypto.randomUUID();

  await saveConversation(
    createTestRecord({
      id,
      messages: [{ role: "user" as const, content: "other" }],
    }),
  );

  return id;
}

// The composer's draft and images belong to the conversation on screen, so
// they are wiped only when that conversation is left.
describe("useConversations composer reset", () => {
  beforeEach(resetConversationsTestState);

  describe("switching", () => {
    it("resets the composer when switching to a different conversation", async () => {
      const { props, state, result } = await setupHook();

      await saveWithMessage(state, result);
      const otherId = await saveOther();

      await act(() => result.current.switchConversation(otherId));

      expect(props.clearConversation).toHaveBeenCalledTimes(1);
      expect(props.resetComposer).toHaveBeenCalledTimes(1);
    });

    it("resets the composer when switching from an unsaved new chat", async () => {
      const { props, result } = await setupHook();
      const otherId = await saveOther();

      await act(() => result.current.switchConversation(otherId));

      expect(props.resetComposer).toHaveBeenCalledTimes(1);
    });

    it("keeps the composer when re-opening the active conversation", async () => {
      const { props, state, result } = await setupHook();

      await saveWithMessage(state, result);
      const activeId = result.current.activeConversationId!;

      await act(() => result.current.switchConversation(activeId));

      // Still torn down and reloaded; only the composer survives.
      expect(props.clearConversation).toHaveBeenCalledTimes(1);
      expect(props.resetComposer).not.toHaveBeenCalled();
    });

    it("keeps the composer when the active id was minted by the first send", async () => {
      const { props, state, result } = await setupHook();

      expect(result.current.activeConversationId).toBeNull();
      await saveWithMessage(state, result);

      const mintedId = result.current.activeConversationId!;

      expect(mintedId).not.toBeNull();
      expect(props.resetComposer).not.toHaveBeenCalled();

      await act(() => result.current.switchConversation(mintedId));

      expect(props.resetComposer).not.toHaveBeenCalled();
    });
  });

  describe("starting a new conversation", () => {
    it("resets the composer when leaving a saved conversation", async () => {
      const { props, state, result } = await setupHook();

      await saveWithMessage(state, result);
      state.chatHistory = [];

      await act(() => result.current.startNewConversation());

      expect(props.resetComposer).toHaveBeenCalledTimes(1);
    });

    it("resets the composer when leaving a new chat that has messages but no id yet", async () => {
      const { props, state, result } = await setupHook();

      state.chatHistory = [{ role: "user", content: "unsaved" }];

      await act(() => result.current.startNewConversation());

      expect(props.clearConversation).toHaveBeenCalledTimes(1);
      expect(props.resetComposer).toHaveBeenCalledTimes(1);
    });

    it("keeps the composer when already in an empty new chat", async () => {
      const { props, state, result } = await setupHook();

      state.chatHistory = [];

      await act(() => result.current.startNewConversation());

      expect(props.clearConversation).toHaveBeenCalledTimes(1);
      expect(props.resetComposer).not.toHaveBeenCalled();
    });
  });

  describe("deleting", () => {
    it("resets the composer when the active conversation is deleted", async () => {
      const { props, state, result } = await setupHook();

      await saveWithMessage(state, result);
      const activeId = result.current.activeConversationId!;

      await act(() => result.current.deleteConversation(activeId));

      expect(props.resetComposer).toHaveBeenCalledTimes(1);
    });

    it("keeps the composer when another conversation is deleted", async () => {
      const { props, state, result } = await setupHook();

      await saveWithMessage(state, result);
      const otherId = await saveOther();

      await act(() => result.current.deleteConversation(otherId));

      expect(props.resetComposer).not.toHaveBeenCalled();
    });
  });

  describe.each([
    ["delete all", "deleteAllConversations"],
    ["delete unbookmarked", "deleteUnbookmarkedConversations"],
  ] as const)("%s", (_name, sweep) => {
    it("resets the composer when the saved live conversation goes", async () => {
      const { props, state, result } = await setupHook();

      await saveWithMessage(state, result);

      await act(() => result.current[sweep]());

      expect(props.clearConversation).toHaveBeenCalledTimes(1);
      expect(props.resetComposer).toHaveBeenCalledTimes(1);
    });

    it("keeps the composer when run from an empty new chat", async () => {
      const { props, state, result } = await setupHook();

      state.chatHistory = [];

      await act(() => result.current[sweep]());

      // The never-saved fresh id is swept too, but there was nothing to leave.
      expect(props.clearConversation).toHaveBeenCalledTimes(1);
      expect(props.resetComposer).not.toHaveBeenCalled();
    });

    it("resets the composer from a new chat with messages but no id yet", async () => {
      const { props, state, result } = await setupHook();

      state.chatHistory = [{ role: "user", content: "unsaved" }];

      await act(() => result.current[sweep]());

      expect(props.resetComposer).toHaveBeenCalledTimes(1);
    });
  });

  describe("browser back/forward", () => {
    it("resets the composer when the hash moves to another conversation", async () => {
      const { props, state, result } = await setupHook();

      await saveWithMessage(state, result);
      await waitForEffects();
      const otherId = await saveOther();

      window.location.hash = otherId;
      await fireHashChange();

      expect(result.current.activeConversationId).toBe(otherId);
      expect(props.resetComposer).toHaveBeenCalledTimes(1);
    });

    it("keeps the composer when the hash is the active conversation", async () => {
      const { props, state, result } = await setupHook();

      await saveWithMessage(state, result);
      await waitForEffects();
      window.location.hash = result.current.activeConversationId!;
      await fireHashChange();

      expect(props.clearConversation).not.toHaveBeenCalled();
      expect(props.resetComposer).not.toHaveBeenCalled();
    });

    it("resets the composer when the hash clears from a saved conversation", async () => {
      const { props, state, result } = await setupHook();

      await saveWithMessage(state, result);
      await waitForEffects();
      state.chatHistory = [];
      history.replaceState(null, "", window.location.pathname);
      await fireHashChange();

      expect(result.current.activeConversationId).toBeNull();
      expect(props.resetComposer).toHaveBeenCalledTimes(1);
    });
  });
});
