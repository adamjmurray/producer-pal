// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// @vitest-environment happy-dom

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteConversation as dbDeleteConversation,
  loadConversation,
} from "#webui/lib/conversation-db";
import {
  renderVoicePersistenceWithHistory,
  resetConversationsDb,
  saveVoiceRecord,
  userTextItem,
  waitForAutosave,
  waitForEffects,
} from "./voice-persistence-test-helpers";

beforeEach(async () => {
  window.location.hash = "";
  await resetConversationsDb();
});

describe("useVoicePersistence when the row is gone", () => {
  // The write transaction refuses to put a deleted conversation back, and
  // refusing quietly would leave a session recording turns nothing keeps.
  it("says so instead of going quiet when the save is refused", async () => {
    const record = await saveVoiceRecord({
      voiceHistory: [userTextItem("first turn")],
    });

    window.location.hash = record.id;

    const { result, rerender } = renderVoicePersistenceWithHistory();

    await waitForEffects();
    expect(result.current.activeConversationId).toBe(record.id);

    // Another tab, with its own store, deletes the record out from under this
    // session. Nothing in memory here can know.
    await dbDeleteConversation(record.id);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    rerender([userTextItem("first turn"), userTextItem("second turn")]);
    await waitForAutosave();

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("no longer in storage"),
    );
    expect(await loadConversation(record.id)).toBeUndefined();
    warn.mockRestore();
  });
});
