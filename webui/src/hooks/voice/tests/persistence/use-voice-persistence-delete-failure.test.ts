// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// @vitest-environment happy-dom

import "fake-indexeddb/auto";
import { act } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Make the DB deletes reject on demand, so a test can check that a delete which
// never happened leaves the live conversation savable. Mock the whole module in
// this dedicated file only, passing everything else through.
const fail = vi.hoisted(() => ({ next: false }));

vi.mock(import("#webui/lib/conversation-db"), async (importOriginal) => {
  const actual = await importOriginal();

  const reject = async (): Promise<never> => {
    fail.next = false;

    return await Promise.reject(new Error("delete failed"));
  };

  return {
    ...actual,
    deleteConversation: vi.fn(async (id: string) =>
      fail.next ? await reject() : await actual.deleteConversation(id),
    ),
    deleteAllConversations: vi.fn(async () =>
      fail.next ? await reject() : await actual.deleteAllConversations(),
    ),
  };
});

import { loadConversation } from "#webui/lib/conversation-db";
import {
  type VoicePersistenceHistoryView,
  renderVoicePersistenceWithHistory,
  resetConversationsDb,
  userTextItem,
  waitForAutosave,
  waitForEffects,
} from "./voice-persistence-test-helpers";

/**
 * Start a live session, save it once, then run a delete that rejects.
 * @param remove - Picks which delete to run against the live session
 * @returns The hook view and the id the session was saved under
 */
async function deleteThatFails(
  remove: (view: VoicePersistenceHistoryView) => Promise<void>,
): Promise<{ view: VoicePersistenceHistoryView; liveId: string }> {
  const view = renderVoicePersistenceWithHistory();

  await waitForEffects();
  view.rerender([userTextItem("first turn")]);
  await waitForAutosave();

  const liveId = view.result.current.activeConversationId;

  if (liveId == null) throw new Error("expected the session to have saved");

  fail.next = true;
  await act(async () => {
    await expect(remove(view)).rejects.toThrow("delete failed");
  });

  return { view, liveId };
}

/**
 * Confirm the session is still live: the next turn saves onto the same record.
 * @param view - The hook view
 * @param liveId - The id the session saves under
 */
async function expectStillSaving(
  view: VoicePersistenceHistoryView,
  liveId: string,
): Promise<void> {
  view.rerender([userTextItem("first turn"), userTextItem("second turn")]);
  await waitForAutosave();

  const record = await loadConversation(liveId);

  expect(record?.voiceHistory).toHaveLength(2);
  expect(view.result.current.activeConversationId).toBe(liveId);
}

beforeEach(async () => {
  fail.next = false;
  window.location.hash = "";
  await resetConversationsDb();
});

describe("useVoicePersistence when a delete fails", () => {
  // The row is still there, so leaving the conversation marked as being deleted
  // would silently stop autosaving a session the user is still in.
  it("keeps saving the live conversation after a failed single delete", async () => {
    const { view, liveId } = await deleteThatFails((v) =>
      v.result.current.deleteConversation(liveIdOf(v)),
    );

    await expectStillSaving(view, liveId);
  });

  it("keeps saving the live conversation after a failed wipe", async () => {
    const { view, liveId } = await deleteThatFails((v) =>
      v.result.current.deleteAllConversations(),
    );

    await expectStillSaving(view, liveId);
  });
});

/**
 * Read the active conversation id, failing the test if there isn't one.
 * @param view - The hook view
 * @returns The active conversation id
 */
function liveIdOf(view: VoicePersistenceHistoryView): string {
  const id = view.result.current.activeConversationId;

  if (id == null) throw new Error("expected an active conversation");

  return id;
}
