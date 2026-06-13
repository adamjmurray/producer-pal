// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  type BranchRecord,
  collapseBranchFamilies,
  computeBranchPoints,
  deriveForkParentId,
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
