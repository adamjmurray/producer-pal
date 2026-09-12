// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// @vitest-environment happy-dom

import "fake-indexeddb/auto";
import { act } from "@testing-library/preact";
import { beforeEach, describe, expect, it } from "vitest";
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
  // refusing quietly would leave a session recording turns nothing keeps. The
  // user is still talking, so the banner is the only place they'd see it.
  it("shows a banner instead of going quiet when the save is refused", async () => {
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

    rerender([userTextItem("first turn"), userTextItem("second turn")]);
    await waitForAutosave();

    expect(result.current.limitNotification).toStrictEqual({
      message: expect.stringContaining("no longer in storage"),
      type: "error",
    });
    expect(await loadConversation(record.id)).toBeUndefined();

    // Standing over the conversation it belongs to is the point; standing over
    // the next one, which saves fine, is the same lie in the other direction.
    await act(() => result.current.startNewConversation());
    await waitForEffects();

    expect(result.current.limitNotification).toBeNull();
  });
});
