// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  describePackageFailure,
  runPackageSteps,
  type PackageStep,
} from "./package-steps.ts";

/**
 * @param name - Step name
 * @param writes - What the step writes
 * @param fail - Error to throw, if any
 * @returns A step that records its run in `ran`
 */
function step(
  name: string,
  writes: string[],
  fail?: Error,
  ran: string[] = [],
): PackageStep {
  return {
    name,
    writes,
    run: () => {
      ran.push(name);

      if (fail !== undefined) {
        throw fail;
      }
    },
  };
}

describe("runPackageSteps", () => {
  it("runs every step and lists what they wrote", () => {
    const result = runPackageSteps([
      step("portal", ["npm/portal.js", "npm/Producer_Pal.amxd"]),
      step("mcpb", ["ext/Producer_Pal.mcpb"]),
    ]);

    expect(result).toStrictEqual({
      failed: null,
      written: [
        "npm/portal.js",
        "npm/Producer_Pal.amxd",
        "ext/Producer_Pal.mcpb",
      ],
      partial: [],
      notWritten: [],
    });
  });

  it("stops at the first failure and says what is on disk", () => {
    const ran: string[] = [];
    const result = runPackageSteps([
      step("portal", ["npm/portal.js"], undefined, ran),
      step("mcpb", ["ext/Producer_Pal.mcpb"], new Error("pack failed"), ran),
      step("copy", ["release/Producer_Pal.mcpb"], undefined, ran),
    ]);

    expect(ran).toStrictEqual(["portal", "mcpb"]);
    expect(result).toStrictEqual({
      failed: { step: "mcpb", error: "Error: pack failed" },
      written: ["npm/portal.js"],
      partial: ["ext/Producer_Pal.mcpb"],
      notWritten: ["release/Producer_Pal.mcpb"],
    });
  });
});

describe("describePackageFailure", () => {
  it("names the step, what was written and what was not", () => {
    const text = describePackageFailure(
      runPackageSteps([
        step("portal", ["npm/portal.js"]),
        step("mcpb", ["ext/Producer_Pal.mcpb"], new Error("pack failed")),
        step("copy", ["release/Producer_Pal.mcpb"]),
      ]),
    );

    expect(text).toContain('failed at "mcpb": Error: pack failed');
    expect(text).toContain("Written: npm/portal.js");
    expect(text).toContain("May be incomplete: ext/Producer_Pal.mcpb");
    expect(text).toContain("Not written: release/Producer_Pal.mcpb");
    expect(text).toContain("re-run");
  });

  it("says nothing when a list is empty", () => {
    const text = describePackageFailure(
      runPackageSteps([step("portal", ["npm/portal.js"], new Error("no"))]),
    );

    expect(text).toContain("Written: nothing");
    expect(text).toContain("Not written: nothing");
  });
});
