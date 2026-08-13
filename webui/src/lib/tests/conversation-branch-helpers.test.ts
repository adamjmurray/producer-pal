// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  type BranchRecord,
  branchFamilyIds,
  collapseBranchFamilies,
  computeBranchPoints,
  deriveForkParentId,
  forkPointerCreatesCycle,
} from "#webui/lib/conversation-branch-helpers";

/**
 * Build a branch record with sensible defaults.
 * @param id - Record id
 * @param overrides - Optional field overrides
 * @returns A branch record for testing
 */
function rec(id: string, overrides: Partial<BranchRecord> = {}): BranchRecord {
  return { id, createdAt: 1000, updatedAt: 1000, ...overrides };
}

describe("deriveForkParentId", () => {
  it("makes a non-fork source the trunk of a new set", () => {
    const source = rec("A");

    expect(deriveForkParentId(source, 2)).toBe("A");
  });

  it("joins the existing set when re-forking at the same point", () => {
    const source = rec("B", { forkParentId: "A", forkedAtIndex: 2 });

    expect(deriveForkParentId(source, 2)).toBe("A");
  });

  it("starts a new set when forking a fork at a different point", () => {
    const source = rec("B", { forkParentId: "A", forkedAtIndex: 2 });

    expect(deriveForkParentId(source, 5)).toBe("B");
  });
});

describe("collapseBranchFamilies", () => {
  it("returns an empty list unchanged", () => {
    expect(collapseBranchFamilies([])).toStrictEqual([]);
  });

  it("passes through unrelated conversations, newest first", () => {
    const a = rec("A", { updatedAt: 1 });
    const b = rec("B", { updatedAt: 3 });
    const c = rec("C", { updatedAt: 2 });

    expect(collapseBranchFamilies([a, b, c]).map((r) => r.id)).toStrictEqual([
      "B",
      "C",
      "A",
    ]);
  });

  it("collapses a trunk and its forks to the most-recently-updated member", () => {
    const trunk = rec("A", { updatedAt: 10 });
    const fork1 = rec("B", {
      forkParentId: "A",
      forkedAtIndex: 1,
      updatedAt: 30,
    });
    const fork2 = rec("C", {
      forkParentId: "A",
      forkedAtIndex: 1,
      updatedAt: 20,
    });

    const result = collapseBranchFamilies([trunk, fork1, fork2]);

    expect(result.map((r) => r.id)).toStrictEqual(["B"]);
  });

  it("collapses a nested chain into one family", () => {
    const a = rec("A", { updatedAt: 10 });
    const b = rec("B", { forkParentId: "A", forkedAtIndex: 1, updatedAt: 20 });
    const c = rec("C", { forkParentId: "B", forkedAtIndex: 3, updatedAt: 40 });

    const result = collapseBranchFamilies([a, b, c]);

    expect(result.map((r) => r.id)).toStrictEqual(["C"]);
  });

  it("keeps orphaned siblings together when their trunk was deleted", () => {
    // A is gone; B and C both still point at it.
    const b = rec("B", { forkParentId: "A", forkedAtIndex: 1, updatedAt: 20 });
    const c = rec("C", { forkParentId: "A", forkedAtIndex: 1, updatedAt: 40 });

    const result = collapseBranchFamilies([b, c]);

    expect(result.map((r) => r.id)).toStrictEqual(["C"]);
  });

  it("keeps distinct families separate", () => {
    const a = rec("A", { updatedAt: 10 });
    const b = rec("B", { forkParentId: "A", forkedAtIndex: 1, updatedAt: 50 });
    const x = rec("X", { updatedAt: 40 });

    const result = collapseBranchFamilies([a, b, x]);

    expect(result.map((r) => r.id)).toStrictEqual(["B", "X"]);
  });

  it("breaks updatedAt ties by newest creation, regardless of order", () => {
    const older = rec("A", { createdAt: 1, updatedAt: 100 });
    const newer = rec("B", {
      forkParentId: "A",
      forkedAtIndex: 1,
      createdAt: 2,
      updatedAt: 100,
    });

    // Equal updatedAt: the newer-created fork represents the family either way.
    expect(
      collapseBranchFamilies([older, newer]).map((r) => r.id),
    ).toStrictEqual(["B"]);
    expect(
      collapseBranchFamilies([newer, older]).map((r) => r.id),
    ).toStrictEqual(["B"]);
  });

  it("does not loop on a self-referential cycle", () => {
    const a = rec("A", { forkParentId: "A", forkedAtIndex: 1 });

    expect(collapseBranchFamilies([a]).map((r) => r.id)).toStrictEqual(["A"]);
  });

  it("promotes the active member to represent its family", () => {
    const trunk = rec("A", { updatedAt: 10 });
    const fork = rec("B", {
      forkParentId: "A",
      forkedAtIndex: 1,
      updatedAt: 30,
    });

    // Viewing the older trunk A: it represents the family, not the newer fork B.
    expect(
      collapseBranchFamilies([trunk, fork], "A").map((r) => r.id),
    ).toStrictEqual(["A"]);
    // With no active id, the newest member still represents it.
    expect(
      collapseBranchFamilies([trunk, fork]).map((r) => r.id),
    ).toStrictEqual(["B"]);
  });

  it("prefers a bookmarked member over a newer unbookmarked fork", () => {
    const trunk = rec("A", { updatedAt: 10, bookmarked: true });
    const fork = rec("B", {
      forkParentId: "A",
      forkedAtIndex: 1,
      updatedAt: 30,
    });

    // Regardless of input order, the bookmarked trunk represents the family.
    expect(
      collapseBranchFamilies([trunk, fork]).map((r) => r.id),
    ).toStrictEqual(["A"]);
    expect(
      collapseBranchFamilies([fork, trunk]).map((r) => r.id),
    ).toStrictEqual(["A"]);
  });

  it("prefers the active member even over a bookmarked sibling", () => {
    const trunk = rec("A", { updatedAt: 10, bookmarked: true });
    const fork = rec("B", {
      forkParentId: "A",
      forkedAtIndex: 1,
      updatedAt: 30,
    });

    // Viewing fork B promotes it despite the bookmarked trunk A.
    expect(
      collapseBranchFamilies([trunk, fork], "B").map((r) => r.id),
    ).toStrictEqual(["B"]);
  });

  it("orders families by their newest member, not the chosen representative", () => {
    const trunk = rec("A", { updatedAt: 10 });
    const fork = rec("B", {
      forkParentId: "A",
      forkedAtIndex: 1,
      updatedAt: 90,
    });
    const x = rec("X", { updatedAt: 50 });

    // Viewing the old trunk A makes it the representative, but its family still
    // sorts by B's recency (90) — ahead of X (50) — so the row doesn't drop.
    expect(
      collapseBranchFamilies([trunk, fork, x], "A").map((r) => r.id),
    ).toStrictEqual(["A", "X"]);
  });
});

describe("computeBranchPoints", () => {
  it("returns nothing when the active conversation is unknown", () => {
    expect(computeBranchPoints("missing", [rec("A")])).toStrictEqual([]);
  });

  it("returns nothing for a conversation with no siblings", () => {
    expect(computeBranchPoints("A", [rec("A")])).toStrictEqual([]);
  });

  it("shows arrows when viewing a fork (trunk first)", () => {
    const a = rec("A");
    const b = rec("B", {
      forkParentId: "A",
      forkedAtIndex: 2,
      createdAt: 2000,
    });

    const points = computeBranchPoints("B", [a, b]);

    expect(points).toStrictEqual([
      { anchorIndex: 2, siblingIds: ["A", "B"], currentIndex: 1 },
    ]);
  });

  it("shows arrows when viewing the trunk", () => {
    const a = rec("A");
    const b = rec("B", {
      forkParentId: "A",
      forkedAtIndex: 2,
      createdAt: 2000,
    });

    const points = computeBranchPoints("A", [a, b]);

    expect(points).toStrictEqual([
      { anchorIndex: 2, siblingIds: ["A", "B"], currentIndex: 0 },
    ]);
  });

  it("orders forks at one point by creation time", () => {
    const a = rec("A");
    const b = rec("B", {
      forkParentId: "A",
      forkedAtIndex: 2,
      createdAt: 3000,
    });
    const c = rec("C", {
      forkParentId: "A",
      forkedAtIndex: 2,
      createdAt: 2000,
    });

    const points = computeBranchPoints("B", [a, b, c]);

    // C created before B, so order is [trunk A, C, B]; viewing B → index 2.
    expect(points[0]).toStrictEqual({
      anchorIndex: 2,
      siblingIds: ["A", "C", "B"],
      currentIndex: 2,
    });
  });

  it("exposes independent arrow sets for multiple fork points", () => {
    const a = rec("A");
    const b = rec("B", {
      forkParentId: "A",
      forkedAtIndex: 2,
      createdAt: 2000,
    });
    const c = rec("C", {
      forkParentId: "A",
      forkedAtIndex: 5,
      createdAt: 3000,
    });

    const points = computeBranchPoints("A", [a, b, c]);

    expect(points).toStrictEqual([
      { anchorIndex: 2, siblingIds: ["A", "B"], currentIndex: 0 },
      { anchorIndex: 5, siblingIds: ["A", "C"], currentIndex: 0 },
    ]);
  });

  it("pages between orphaned siblings without the deleted trunk", () => {
    const b = rec("B", {
      forkParentId: "A",
      forkedAtIndex: 2,
      createdAt: 2000,
    });
    const c = rec("C", {
      forkParentId: "A",
      forkedAtIndex: 2,
      createdAt: 3000,
    });

    const points = computeBranchPoints("B", [b, c]);

    expect(points).toStrictEqual([
      { anchorIndex: 2, siblingIds: ["B", "C"], currentIndex: 0 },
    ]);
  });

  it("shows no arrows for a lone orphan whose trunk was deleted", () => {
    const b = rec("B", { forkParentId: "A", forkedAtIndex: 2 });

    expect(computeBranchPoints("B", [b])).toStrictEqual([]);
  });

  it("shows both the inbound and outbound sets for a mid-chain branch", () => {
    // A → B (at 2); B → C (at 4). Viewing B: it is a fork of A and a trunk of C.
    const a = rec("A");
    const b = rec("B", {
      forkParentId: "A",
      forkedAtIndex: 2,
      createdAt: 2000,
    });
    const c = rec("C", {
      forkParentId: "B",
      forkedAtIndex: 4,
      createdAt: 3000,
    });

    const points = computeBranchPoints("B", [a, b, c]);

    expect(points).toStrictEqual([
      { anchorIndex: 2, siblingIds: ["A", "B"], currentIndex: 1 },
      { anchorIndex: 4, siblingIds: ["B", "C"], currentIndex: 0 },
    ]);
  });
});

describe("branchFamilyIds", () => {
  it("returns just the seeds when nothing else shares their root", () => {
    const a = rec("A");
    const other = rec("Z");

    const family = branchFamilyIds(["A"], [a, other]);

    expect([...family].sort()).toStrictEqual(["A"]);
  });

  it("includes every sibling sharing a seed's family root", () => {
    // Seeding with only the trunk must still protect both forks off it — the
    // gap the earlier trunk+source-only protection left open.
    const a = rec("A");
    const b = rec("B", { forkParentId: "A", forkedAtIndex: 1 });
    const c = rec("C", { forkParentId: "A", forkedAtIndex: 1 });

    const family = branchFamilyIds(["A"], [a, b, c]);

    expect([...family].sort()).toStrictEqual(["A", "B", "C"]);
  });

  it("walks the fork chain so a nested family collapses to one root", () => {
    // A → B → C. Seeding with the deepest member protects the whole chain.
    const a = rec("A");
    const b = rec("B", { forkParentId: "A", forkedAtIndex: 1 });
    const c = rec("C", { forkParentId: "B", forkedAtIndex: 3 });

    const family = branchFamilyIds(["C"], [a, b, c]);

    expect([...family].sort()).toStrictEqual(["A", "B", "C"]);
  });

  it("keeps a referenced-but-deleted trunk seed protected", () => {
    // The trunk A is already gone; its orphaned siblings still resolve to root A
    // and the seed A itself stays in the set so a concurrent re-save is shielded.
    const b = rec("B", { forkParentId: "A", forkedAtIndex: 1 });
    const c = rec("C", { forkParentId: "A", forkedAtIndex: 1 });

    const family = branchFamilyIds(["A"], [b, c]);

    expect([...family].sort()).toStrictEqual(["A", "B", "C"]);
  });

  it("excludes unrelated families", () => {
    const a = rec("A");
    const b = rec("B", { forkParentId: "A", forkedAtIndex: 1 });
    const x = rec("X");
    const y = rec("Y", { forkParentId: "X", forkedAtIndex: 1 });

    const family = branchFamilyIds(["A"], [a, b, x, y]);

    expect([...family].sort()).toStrictEqual(["A", "B"]);
  });

  it("returns an empty set for no seeds", () => {
    const a = rec("A");

    expect(branchFamilyIds([], [a]).size).toBe(0);
  });
});

describe("forkPointerCreatesCycle", () => {
  /**
   * Build a parent-pointer lookup from id→forkParentId pairs.
   * @param pairs - Tuples of [id, forkParentId | undefined]
   * @returns A parentOf map
   */
  const parents = (pairs: [string, string | undefined][]) =>
    new Map<string, string | undefined>(pairs);

  it("flags a self-parent", () => {
    expect(forkPointerCreatesCycle("A", "A", parents([["A", "A"]]))).toBe(true);
  });

  it("flags a two-node cycle (A↔B)", () => {
    const parentOf = parents([
      ["A", "B"],
      ["B", "A"],
    ]);

    expect(forkPointerCreatesCycle("A", "B", parentOf)).toBe(true);
  });

  it("flags a longer loop (A→B→C→A)", () => {
    const parentOf = parents([
      ["A", "B"],
      ["B", "C"],
      ["C", "A"],
    ]);

    expect(forkPointerCreatesCycle("A", "B", parentOf)).toBe(true);
  });

  it("allows a valid chain that bottoms out at a root", () => {
    const parentOf = parents([
      ["A", "B"],
      ["B", "C"],
    ]);

    expect(forkPointerCreatesCycle("A", "B", parentOf)).toBe(false);
  });

  it("allows a pointer to a missing/deleted parent", () => {
    expect(forkPointerCreatesCycle("A", "gone", parents([["A", "gone"]]))).toBe(
      false,
    );
  });

  it("does not implicate a pre-existing cycle that doesn't include id", () => {
    // B↔C loop; A merely points into it without being part of the loop.
    const parentOf = parents([
      ["A", "B"],
      ["B", "C"],
      ["C", "B"],
    ]);

    expect(forkPointerCreatesCycle("A", "B", parentOf)).toBe(false);
  });
});
