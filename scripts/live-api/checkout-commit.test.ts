// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { checkoutCommit } from "./checkout-commit.ts";

/**
 * A fake git that answers rev-parse and status.
 * @param status - What `git status --porcelain` prints
 * @returns The fake
 */
function fakeGit(status: string): (args: string[]) => string {
  return (args) => (args[0] === "rev-parse" ? "1a2b3c4" : status);
}

describe("checkoutCommit", () => {
  it("is the short commit when the folder is clean", () => {
    expect(checkoutCommit("remote-script", fakeGit(""))).toBe("1a2b3c4");
  });

  it("marks uncommitted changes in the folder", () => {
    expect(
      checkoutCommit("remote-script", fakeGit(" M remote-script/a.py")),
    ).toBe("1a2b3c4-dirty");
  });

  it("asks git about that folder only", () => {
    const calls: string[][] = [];

    checkoutCommit("remote-script/Producer_Pal", (args) => {
      calls.push(args);

      return "";
    });

    expect(calls[1]).toStrictEqual([
      "--no-optional-locks",
      "status",
      "--porcelain",
      "--",
      "remote-script/Producer_Pal",
    ]);
  });

  it("is empty when git fails", () => {
    expect(
      checkoutCommit("remote-script", () => {
        throw new Error("not a git repository");
      }),
    ).toBe("");
  });

  it("reads this checkout with the real git", () => {
    expect(checkoutCommit("remote-script")).toMatch(/^[0-9a-f]{7,}(-dirty)?$/);
  });
});
