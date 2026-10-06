// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkBuildMatchesCheckout,
  checkBuildVersion,
  readBuildInfo,
  readCheckout,
} from "./build-info.ts";

const BUILD = { version: "2.5.0", commit: "abc1234" };
const CLEAN_HEAD = { head: "abc1234", treeClean: true };

let releaseDir: string;

beforeEach(() => {
  releaseDir = mkdtempSync(join(tmpdir(), "ppal-build-info-"));
});

afterEach(() => {
  rmSync(releaseDir, { recursive: true, force: true });
});

describe("readBuildInfo", () => {
  it("reads the recorded version and commit", () => {
    writeFileSync(join(releaseDir, "build-info.json"), JSON.stringify(BUILD));

    expect(readBuildInfo(releaseDir)).toStrictEqual(BUILD);
  });

  it("returns null for a missing file", () => {
    expect(readBuildInfo(releaseDir)).toBeNull();
  });

  it("returns null for truncated JSON", () => {
    writeFileSync(join(releaseDir, "build-info.json"), '{"version": "2.5');

    expect(readBuildInfo(releaseDir)).toBeNull();
  });

  it.each([
    ["null", "null"],
    ["no commit", '{"version":"2.5.0"}'],
    ["a non-string version", '{"version":2,"commit":"abc"}'],
    ["an empty commit", '{"version":"2.5.0","commit":""}'],
  ])("returns null for %s", (_label, text) => {
    writeFileSync(join(releaseDir, "build-info.json"), text);

    expect(readBuildInfo(releaseDir)).toBeNull();
  });
});

describe("readCheckout", () => {
  it("reads HEAD and a clean tree", () => {
    const calls: string[][] = [];
    const checkout = readCheckout((...args) => {
      calls.push(args);

      return args[0] === "rev-parse" ? "abc1234" : "";
    });

    expect(checkout).toStrictEqual(CLEAN_HEAD);
    expect(calls).toStrictEqual([
      ["rev-parse", "--short=7", "HEAD"],
      ["status", "--porcelain"],
    ]);
  });

  it("reports a dirty tree", () => {
    const checkout = readCheckout((...args) =>
      args[0] === "rev-parse" ? "abc1234" : " M src/a.ts",
    );

    expect(checkout.treeClean).toBe(false);
  });
});

describe("checkBuildVersion", () => {
  it("accepts a matching version", () => {
    expect(checkBuildVersion(BUILD, "2.5.0")).toBeNull();
  });

  it("refuses a missing build", () => {
    expect(checkBuildVersion(null, "2.5.0")?.join("\n")).toContain(
      "build-info.json is missing",
    );
  });

  it("refuses another version", () => {
    const refusal = checkBuildVersion(BUILD, "2.6.0")?.join("\n");

    expect(refusal).toContain("build in release/ is 2.5.0");
    expect(refusal).toContain("package.json says 2.6.0");
  });
});

describe("checkBuildMatchesCheckout", () => {
  const check = (
    overrides: Partial<Parameters<typeof checkBuildMatchesCheckout>[0]>,
  ): string | undefined =>
    checkBuildMatchesCheckout({
      build: BUILD,
      version: "2.5.0",
      checkout: CLEAN_HEAD,
      ...overrides,
    })?.join("\n");

  it("accepts a build from this clean checkout", () => {
    expect(check({})).toBeUndefined();
  });

  it("refuses a dirty tree", () => {
    expect(
      check({ checkout: { head: "abc1234", treeClean: false } }),
    ).toContain("Working tree is not clean");
  });

  it("refuses when HEAD moved since the build", () => {
    const refusal = check({ checkout: { head: "def5678", treeClean: true } });

    expect(refusal).toContain("came from abc1234, but HEAD is def5678");
  });

  it("refuses a missing build", () => {
    expect(check({ build: null })).toContain("build-info.json is missing");
  });

  it("refuses a build of another version", () => {
    expect(check({ version: "2.6.0" })).toContain("package.json says 2.6.0");
  });

  it("reports a dirty tree before a stale build", () => {
    expect(
      check({
        build: null,
        checkout: { head: "abc1234", treeClean: false },
      }),
    ).toContain("Working tree is not clean");
  });
});
