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
  LATE_MARKER,
  conversationCarries,
  type DestructiveOp,
  type Handle,
  type SaveFlavor,
  TIMINGS,
  runInterleaving,
  saveHistory,
} from "./interleaving-test-helpers";
import { resetConversationsTestState } from "./use-conversations-test-helpers";

/**
 * Every pairing of a conversation-changing operation with a save already on its
 * way to the DB. The bugs this suite exists for are all composition failures —
 * two individually-correct guards meeting — so the pairs are enumerated rather
 * than picked one per bug report.
 */

const FLAVORS: SaveFlavor[] = [
  {
    name: "an already-saved conversation",
    arrange: async (handle) => {
      await saveHistory(handle, "first turn");

      return handle.result.current.activeConversationId;
    },
  },
  {
    name: "a brand-new conversation (id minted inside the save)",
    arrange: () => Promise.resolve(null),
  },
  {
    name: "a fork branching off the active conversation",
    arrange: async (handle) => {
      await saveHistory(handle, "first turn");
      const sourceId = handle.result.current.activeConversationId;

      handle.pendingForkRef.current = { anchorIndex: 0 };

      return sourceId;
    },
    sparesLive: true,
  },
];

const OPS: DestructiveOp[] = [
  {
    name: "deleting the active conversation",
    run: async (handle) => {
      const id = handle.result.current.activeConversationId;

      if (id != null) await handle.result.current.deleteConversation(id);
    },
    destroysLive: true,
    destroysBystander: false,
  },
  {
    name: "deleting an unrelated conversation",
    run: (handle, bystanderId) =>
      handle.result.current.deleteConversation(bystanderId),
    destroysLive: false,
    destroysBystander: true,
  },
  {
    name: "deleting every conversation",
    run: (handle) => handle.result.current.deleteAllConversations(),
    destroysLive: true,
    destroysBystander: true,
  },
  {
    name: "deleting the unbookmarked conversations",
    run: (handle) => handle.result.current.deleteUnbookmarkedConversations(),
    destroysLive: true,
    destroysBystander: true,
  },
  {
    name: "switching to another conversation",
    run: (handle, bystanderId) =>
      handle.result.current.switchConversation(bystanderId),
    destroysLive: false,
    destroysBystander: false,
  },
  {
    name: "starting a new conversation",
    run: (handle) =>
      act(() => {
        handle.result.current.startNewConversation();
      }),
    destroysLive: false,
    destroysBystander: false,
  },
];

/**
 * Run a brand-new conversation's first save so it lands after `opName` took
 * the user away, and assert the save survived carrying its late content.
 * @param opName - Name of the op that leaves the conversation mid-save
 */
async function expectFirstSaveSurvivesLeaving(opName: string): Promise<void> {
  const outcome = await runInterleaving(
    OPS.find((op) => op.name === opName)!,
    FLAVORS.find((flavor) => flavor.name.startsWith("a brand-new"))!,
    "write-last",
  );

  const saved = outcome.ids.filter((id) => id !== outcome.bystanderId);

  expect(saved).toHaveLength(1);
  expect(await conversationCarries(saved[0]!, LATE_MARKER)).toBe(true);
}

describe("useConversations save/operation interleavings", () => {
  beforeEach(resetConversationsTestState);

  const cases = FLAVORS.flatMap((flavor) =>
    TIMINGS.map((timing) => ({
      flavor,
      timing,
      saving: flavor.name,
      when:
        timing === "write-first"
          ? "the write lands first"
          : "the write lands last",
    })),
  );

  describe.each(OPS)("$name", (op) => {
    it.each(cases)("holds when saving $saving and $when", async (testCase) => {
      const outcome = await runInterleaving(
        op,
        testCase.flavor,
        testCase.timing,
      );

      expect(outcome.bystanderId).toBeDefined();
    });
  });

  it("keeps a first save that lands after the user clicks New", async () => {
    // Leaving a conversation is not a reason to drop its save: the write
    // carries the id it was started for, and losing the turn the user just
    // sent because they moved on is data loss, not a race being closed.
    await expectFirstSaveSurvivesLeaving("starting a new conversation");
  });

  it("keeps a first save that lands after the user switches away", async () => {
    await expectFirstSaveSurvivesLeaving("switching to another conversation");
  });

  it("keeps a bookmarked conversation through the unbookmarked sweep", async () => {
    // The sweep spares bookmarked records, so its racing save must land rather
    // than be dropped along with everything else.
    const bookmarkOp: DestructiveOp = {
      name: "deleting the unbookmarked conversations",
      run: (handle: Handle) =>
        handle.result.current.deleteUnbookmarkedConversations(),
      destroysLive: false,
      destroysBystander: true,
    };
    const bookmarkedFlavor: SaveFlavor = {
      name: "a bookmarked conversation",
      arrange: async (handle: Handle) => {
        await saveHistory(handle, "first turn");
        const id = handle.result.current.activeConversationId!;

        await act(() => handle.result.current.toggleBookmark(id));

        return id;
      },
    };

    const outcome = await runInterleaving(
      bookmarkOp,
      bookmarkedFlavor,
      "write-last",
    );

    expect(outcome.ids).toContain(outcome.liveId);
  });

  it("spares a bookmarked bystander from the unbookmarked sweep", async () => {
    const op: DestructiveOp = {
      name: "deleting the unbookmarked conversations",
      run: (handle: Handle) =>
        handle.result.current.deleteUnbookmarkedConversations(),
      destroysLive: true,
      destroysBystander: false,
    };

    const bookmarkedBystander: SaveFlavor = {
      name: "an already-saved conversation",
      // Bookmarking the bystander is setup, not part of the race: doing it
      // inside the operation would let the racing save join the chain the
      // sweep then drains, deadlocking the two.
      arrange: async (handle: Handle) => {
        await act(() =>
          handle.result.current.toggleBookmark(
            handle.result.current.conversations[0]!.id,
          ),
        );

        return await FLAVORS[0]!.arrange(handle);
      },
    };

    expect(
      await runInterleaving(op, bookmarkedBystander, "write-last"),
    ).toBeDefined();
  });
});
