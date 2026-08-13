// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { nextVersion, parseVersion } from "./next-version.ts";

describe("nextVersion", () => {
  it("walks a whole release cycle", () => {
    // The shape of every release: pick where you are going, iterate, promote.
    const patch = nextVersion("2.1.0", "patch");
    const minor = nextVersion(patch, "minor");
    const rc2 = nextVersion(minor, "rc");
    const rc3 = nextVersion(rc2, "rc");

    expect([patch, minor, rc2, rc3]).toStrictEqual([
      "2.1.1-rc1",
      "2.2.0-rc1",
      "2.2.0-rc2",
      "2.2.0-rc3",
    ]);
    expect(nextVersion(rc3, "ga")).toBe("2.2.0");
  });

  it.each([
    ["major", "2.1.3", "3.0.0-rc1"],
    ["minor", "2.1.3", "2.2.0-rc1"],
    ["patch", "2.1.3", "2.1.4-rc1"],
  ] as const)("%s from a GA version appends -rc1", (type, from, expected) => {
    expect(nextVersion(from, type)).toBe(expected);
  });

  it.each([
    ["major", "3.0.0-rc1"],
    ["minor", "2.2.0-rc1"],
    ["patch", "2.1.4-rc1"],
  ] as const)(
    "%s from a pre-release ignores the suffix and restarts at -rc1",
    (type, expected) => {
      // Retargeting mid-cycle: 2.1.3-rc7 was never published, so the bump moves
      // off 2.1.3 entirely rather than counting from it.
      expect(nextVersion("2.1.3-rc7", type)).toBe(expected);
    },
  );

  it("counts rc numbers past 9", () => {
    expect(nextVersion("2.1.0-rc9", "rc")).toBe("2.1.0-rc10");
    expect(nextVersion("2.1.0-rc10", "rc")).toBe("2.1.0-rc11");
  });

  it("refuses to bump the rc number off a GA version", () => {
    // There is no rc to increment, and guessing (rc1? rc2?) would be worse than
    // saying so — you have to choose major/minor/patch to open a cycle.
    expect(() => nextVersion("2.1.0", "rc")).toThrow(/not a pre-release/);
  });

  it("refuses to promote a GA version to GA", () => {
    expect(() => nextVersion("2.1.0", "ga")).toThrow(/already a GA version/);
  });

  it("rejects a current version it cannot reason about", () => {
    expect(() => nextVersion("2.1.0-beta.1", "patch")).toThrow(
      /Not a Producer Pal version/,
    );
  });
});

describe("parseVersion", () => {
  it("splits a GA version", () => {
    expect(parseVersion("12.3.45")).toStrictEqual({
      major: 12,
      minor: 3,
      patch: 45,
      rc: null,
    });
  });

  it("splits a pre-release", () => {
    expect(parseVersion("2.1.0-rc12")).toStrictEqual({
      major: 2,
      minor: 1,
      patch: 0,
      rc: 12,
    });
  });

  it.each([
    ["2.1", "a missing patch part"],
    ["2.1.0.1", "a fourth part"],
    ["v2.1.0", "a git tag's leading v"],
    ["2.1.0-beta", "a non-rc suffix"],
    ["2.1.0-rc", "an rc with no number"],
    ["2.1.0-rc0", "rc0 (cycles start at rc1)"],
    ["2.1.0-rc1.2", "a dotted rc"],
    ["", "an empty string"],
  ])("rejects %j — %s", (version) => {
    expect(() => parseVersion(version)).toThrow(/Not a Producer Pal version/);
  });
});
