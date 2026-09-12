// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// @vitest-environment happy-dom

// A delete decides whether to start a new session after its awaits, so the
// answer has to come from the conversation that is live by then. The user can
// open another one while the delete runs.

import "fake-indexeddb/auto";
import { act } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as conversationDb from "#webui/lib/conversation-db";
import { openGate } from "#webui/test-utils/async-test-helpers";
import {
  renderVoicePersistence,
  resetConversationsDb,
  saveVoiceRecord,
  setupLiveRecordWithDeletionSpy,
  userTextItem,
  waitForEffects,
} from "./voice-persistence-test-helpers";

beforeEach(async () => {
  window.location.hash = "";
  await resetConversationsDb();
});

/**
 * Hold the unbookmarked sweep open until the returned release is called, so a
 * test can act while it is still in flight.
 * @returns release (let the sweep finish) and restore (undo the spy)
 */
function gateNextSweep(): { release: () => void; restore: () => void } {
  const sweep = conversationDb.deleteUnbookmarkedConversations;
  const [gate, release] = openGate();
  const spy = vi
    .spyOn(conversationDb, "deleteUnbookmarkedConversations")
    .mockImplementationOnce(async () => {
      await gate;

      return await sweep();
    });

  return { release, restore: () => spy.mockRestore() };
}

describe("useVoicePersistence delete vs. switch", () => {
  it("keeps the conversation opened while the delete was running", async () => {
    const doomed = await saveVoiceRecord({
      voiceHistory: [userTextItem("doomed")],
    });
    const opened = await saveVoiceRecord({
      id: "opened",
      voiceHistory: [userTextItem("opened")],
    });

    window.location.hash = doomed.id;

    const { result } = renderVoicePersistence();

    await waitForEffects();
    expect(result.current.activeConversationId).toBe(doomed.id);

    const original = conversationDb.deleteConversation;
    const [gate, release] = openGate();
    const spy = vi
      .spyOn(conversationDb, "deleteConversation")
      .mockImplementationOnce(async (id: string) => {
        await gate;

        return await original(id);
      });
    let deleting!: Promise<void>;

    await act(async () => {
      deleting = result.current.deleteConversation(doomed.id);
      await result.current.switchConversation(opened.id);
      release();
      await deleting;
    });

    expect(result.current.activeConversationId).toBe(opened.id);
    expect(await conversationDb.loadConversation(doomed.id)).toBeUndefined();
    spy.mockRestore();
  });
});

describe("useVoicePersistence bulk delete vs. switch", () => {
  it("tears down the live session for whichever conversation is live when a bulk delete lands", async () => {
    const bookmarked = await saveVoiceRecord({
      voiceHistory: [userTextItem("keep")],
      bookmarked: true,
    });
    const unbookmarked = await saveVoiceRecord({
      voiceHistory: [userTextItem("sweep me")],
    });

    window.location.hash = bookmarked.id;

    const onLiveRecordDeleted = vi.fn();
    const { result } = renderVoicePersistence({ onLiveRecordDeleted });

    await waitForEffects();
    expect(result.current.activeConversationId).toBe(bookmarked.id);

    const { release, restore } = gateNextSweep();
    let sweeping!: Promise<void>;

    await act(async () => {
      sweeping = result.current.deleteUnbookmarkedConversations();
      await result.current.switchConversation(unbookmarked.id);
      release();
      await sweeping;
    });

    // The sweep started while `bookmarked` (spared) was live, but the user
    // switched to `unbookmarked` (swept) before it landed — the live session
    // must go with whichever conversation is actually live at the end.
    expect(onLiveRecordDeleted).toHaveBeenCalledOnce();
    expect(
      await conversationDb.loadConversation(unbookmarked.id),
    ).toBeUndefined();
    expect(result.current.activeConversationId).toBeNull();
    restore();
  });
});

describe("useVoicePersistence bulk delete vs. bookmark", () => {
  it("does not tear down or wipe a live record bookmarked mid-sweep", async () => {
    // The sweep's pre-await mark blocks patchActiveMeta, so the bookmark this
    // test toggles mid-flight lands in the DB but can't reach metaRef — the
    // exact staleness a metaRef-derived decision would get wrong.
    const {
      record: live,
      onLiveRecordDeleted,
      result,
    } = await setupLiveRecordWithDeletionSpy({
      voiceHistory: [userTextItem("keep me now")],
    });

    expect(result.current.activeConversationId).toBe(live.id);

    const { release, restore } = gateNextSweep();
    let sweeping!: Promise<void>;

    await act(async () => {
      sweeping = result.current.deleteUnbookmarkedConversations();
      await result.current.toggleBookmark(live.id);
      release();
      await sweeping;
    });

    expect(onLiveRecordDeleted).not.toHaveBeenCalled();
    expect(result.current.activeConversationId).toBe(live.id);

    const reloaded = await conversationDb.loadConversation(live.id);

    expect(reloaded?.bookmarked).toBe(true);
    restore();
  });
});

describe("useVoicePersistence bulk delete vs. a failed survival check", () => {
  it("leaves the live session alone and resolves the slot when the DB read fails", async () => {
    const {
      record: live,
      onLiveRecordDeleted,
      result,
    } = await setupLiveRecordWithDeletionSpy({
      voiceHistory: [userTextItem("keep me")],
    });

    expect(result.current.activeConversationId).toBe(live.id);

    // Only the sweep's own survival check should see this: it's the next
    // (and only, in this flow) call to loadConversation after the mount load
    // above has already resolved.
    const spy = vi
      .spyOn(conversationDb, "loadConversation")
      .mockRejectedValueOnce(new Error("simulated DB failure"));

    // Must resolve, not reject: the caller (a Settings button) is
    // fire-and-forget with no .catch() anywhere above it.
    await act(() => result.current.deleteUnbookmarkedConversations());

    expect(onLiveRecordDeleted).not.toHaveBeenCalled();
    // The slot must not be left stuck marked-deleted: it resolves back to the
    // conversation that was live going in, on the assumption a failed check
    // isn't proof it was swept.
    expect(result.current.activeConversationId).toBe(live.id);
    // `live` was genuinely unbookmarked, so the real (unmocked) delete did
    // remove its row — only confirming that failed. The sidebar must still
    // refresh to the DB's actual state despite it, not stay on the stale
    // pre-sweep list.
    expect(result.current.conversations).toStrictEqual([]);
    spy.mockRestore();
  });
});
