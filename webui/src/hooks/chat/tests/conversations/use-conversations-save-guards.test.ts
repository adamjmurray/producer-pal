// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import "fake-indexeddb/auto";
import { act } from "@testing-library/preact";
import { beforeEach, describe, expect, it } from "vitest";
import {
  deleteConversation as dbDeleteConversation,
  listAllConversationSummaries,
  loadConversation,
} from "#webui/lib/conversation-db";
import {
  gateNextSave,
  saveHistory,
  setupInterleavingHook,
} from "./interleaving-test-helpers";
import {
  resetConversationsTestState,
  waitForEffects,
} from "./use-conversations-test-helpers";

describe("useConversations save guards", () => {
  beforeEach(resetConversationsTestState);

  it("drops a save whose record was deleted from another tab, and says so", async () => {
    // A second tab has its own hook, its own store, and no way to hear about
    // this one's saves — so nothing in memory can answer whether the record is
    // still there. The write transaction reads the store and finds out.
    const handle = await setupInterleavingHook();

    await saveHistory(handle, "first turn");
    const id = handle.result.current.activeConversationId!;
    const { release, restore } = gateNextSave();

    await act(async () => {
      handle.state.chatHistory = [
        { role: "user", content: "first turn" },
        { role: "assistant", content: "second turn" },
      ];

      const save = handle.result.current.saveCurrentConversation();

      // The other tab deletes it while this save is on its way to the DB.
      await dbDeleteConversation(id);
      release();
      await save;
    });

    await waitForEffects();
    restore();

    expect(await loadConversation(id)).toBeUndefined();

    // Refusing quietly would leave the user typing into a conversation that
    // stopped being saved several turns ago.
    expect(handle.result.current.notification?.message).toContain(
      "no longer in storage",
    );
  });

  it("does not adopt metadata from a save for a conversation the user has left", async () => {
    const handle = await setupInterleavingHook();

    await saveHistory(handle, "first turn");
    const id = handle.result.current.activeConversationId!;

    await act(() => handle.result.current.renameConversation(id, "Alpha"));

    const { release, restore } = gateNextSave();

    await act(async () => {
      handle.state.chatHistory = [
        { role: "user", content: "first turn" },
        { role: "assistant", content: "second turn" },
      ];

      const save = handle.result.current.saveCurrentConversation();

      handle.result.current.startNewConversation();
      release();
      await save;
    });

    await waitForEffects();
    restore();

    // The late write belongs in Alpha and lands there. What it must not do is
    // hand Alpha's title and creation time to the empty conversation the user
    // has moved on to.
    await saveHistory(handle, "a fresh start");

    const summaries = await listAllConversationSummaries();
    const fresh = summaries.find((summary) => summary.id !== id);

    expect(fresh?.title).toBe("a fresh start");
    restore();
  });
});
