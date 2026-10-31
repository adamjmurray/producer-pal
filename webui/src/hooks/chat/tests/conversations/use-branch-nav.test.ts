// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import "fake-indexeddb/auto";
import { act, renderHook } from "@testing-library/preact";
import { waitForHookState } from "#webui/test-utils/async-test-helpers";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(import("#webui/lib/conversation-db"), async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    listAllConversationSummaries: vi.fn(actual.listAllConversationSummaries),
  };
});

import { useBranchNav } from "#webui/hooks/chat/use-chat-mode-state";
import {
  type ConversationRecord,
  getConversationDb,
  listAllConversationSummaries,
  resetDbCache,
  saveConversation,
} from "#webui/lib/conversation-db";
import { createTestRecord } from "#webui/test-utils/conversation-test-helpers";

/**
 * Persist a minimal conversation record.
 * @param id - Record id
 * @param overrides - Branch/timestamp overrides
 */
async function saveRecord(
  id: string,
  overrides: Partial<ConversationRecord> = {},
): Promise<void> {
  await saveConversation(
    createTestRecord({
      id,
      createdAt: 1000,
      updatedAt: 1000,
      messages: [{ role: "user", content: "hi" }],
      ...overrides,
    }),
  );
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

    await waitForHookState(() => {
      expect(result.current).toStrictEqual([
        { anchorIndex: 0, siblingIds: ["A", "B"], currentIndex: 1 },
      ]);
    });
  });

  // Holds the read open so the switch always lands first. Left to chance, this
  // guard was covered only on fast machines, which flipped CI coverage.
  it("ignores a read that finishes after the active conversation changed", async () => {
    await saveRecord("A");
    await saveRecord("B", {
      forkParentId: "A",
      forkedAtIndex: 0,
      createdAt: 2000,
    });
    const summaries = await listAllConversationSummaries();
    let finishRead!: (value: typeof summaries) => void;
    const staleRead = new Promise<typeof summaries>((resolve) => {
      finishRead = resolve;
    });

    vi.mocked(listAllConversationSummaries).mockReturnValueOnce(staleRead);

    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) => useBranchNav(id, 0),
      { initialProps: { id: "B" as string | null } },
    );

    rerender({ id: null });

    await act(async () => {
      finishRead(summaries);
      await staleRead;
    });

    expect(result.current).toStrictEqual([]);
  });

  it("clears points when no siblings remain", async () => {
    await saveRecord("Solo");

    const { result } = renderHook(() => useBranchNav("Solo", 0));

    // Give the async read a chance to run, then confirm it stays empty.
    await waitForHookState(() => expect(result.current).toStrictEqual([]));
  });
});
