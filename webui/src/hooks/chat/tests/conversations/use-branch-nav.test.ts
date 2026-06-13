// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import "fake-indexeddb/auto";
import { renderHook, waitFor } from "@testing-library/preact";
import { beforeEach, describe, expect, it } from "vitest";
import { useBranchNav } from "#webui/hooks/chat/use-chat-mode-state";
import {
  type ConversationRecord,
  getConversationDb,
  resetDbCache,
  saveConversation,
} from "#webui/lib/conversation-db";

/**
 * Persist a minimal conversation record.
 * @param id - Record id
 * @param overrides - Branch/timestamp overrides
 */
async function saveRecord(
  id: string,
  overrides: Partial<ConversationRecord> = {},
): Promise<void> {
  await saveConversation({
    id,
    title: null,
    createdAt: 1000,
    updatedAt: 1000,
    bookmarked: false,
    provider: null,
    model: null,
    modelLabel: null,
    thinking: null,
    temperature: null,
    showThoughts: null,
    smallModelMode: null,
    totalUsage: null,
    sessionType: "text",
    messages: [{ role: "user", content: "hi" }],
    voiceHistory: null,
    ...overrides,
  });
}

describe("useBranchNav", () => {
  beforeEach(async () => {
    await resetDbCache();
    const db = await getConversationDb();

    await db.clear("conversations");
  });

  it("returns no points for a null active conversation", () => {
    const { result } = renderHook(() => useBranchNav(null, 0));

    expect(result.current).toStrictEqual([]);
  });

  it("computes branch points for the active conversation", async () => {
    await saveRecord("A");
    await saveRecord("B", {
      forkParentId: "A",
      forkedAtIndex: 0,
      createdAt: 2000,
    });

    const { result } = renderHook(() => useBranchNav("B", 0));

    await waitFor(() => {
      expect(result.current).toStrictEqual([
        { anchorIndex: 0, siblingIds: ["A", "B"], currentIndex: 1 },
      ]);
    });
  });

  it("clears points when no siblings remain", async () => {
    await saveRecord("Solo");

    const { result } = renderHook(() => useBranchNav("Solo", 0));

    // Give the async read a chance to run, then confirm it stays empty.
    await waitFor(() => expect(result.current).toStrictEqual([]));
  });
});
