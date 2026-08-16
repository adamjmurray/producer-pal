// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  findSourceFiles,
  projectRoot,
} from "#src/test/helpers/meta-test-helpers.ts";
import packageJson from "../../../../package.json" with { type: "json" };

// Build flags gate code out of release bundles: rolldown substitutes their value
// at build time, so every flag needs a documented way to switch it ON —
// otherwise the code it guards is unreachable in every build and can never be
// exercised by hand.
//
// Debug flags are turned on by build:debug / dev:debug, so a development build
// always has them. Opt-in flags are deliberately left off and set by hand for a
// specific need (a LAN/remote browser origin, in the CORS case).
const DEBUG_FLAGS = [
  "ENABLE_LIVE_API",
  "ENABLE_CODE_EXEC",
  "ENABLE_WARP_MARKERS",
];
const OPT_IN_FLAGS = ["ENABLE_REMOTE_CORS"];
const BUILD_FLAGS = [...DEBUG_FLAGS, ...OPT_IN_FLAGS];

// Runtime flags are read from the real environment when the portal runs (users
// set them in their MCP client config), so they must stay out of the rolldown
// replacements — substituting one would freeze it off at build time.
const RUNTIME_FLAGS = ["ENABLE_LOGGING"];

const FLAG_READ = /process\.env\.(ENABLE_[A-Z0-9_]+)/g;

const scripts = packageJson.scripts as Record<string, string>;
const rolldownConfig = readRepoFile("config/rolldown.config.mjs");
const ciWorkflow = readRepoFile(".github/workflows/run-checks-and-tests.yml");

describe("build flags", () => {
  it("only reads flags that are classified as build-time or runtime", () => {
    expect([...flagsReadInSrc()].toSorted()).toStrictEqual(
      [...BUILD_FLAGS, ...RUNTIME_FLAGS].toSorted(),
    );
  });

  it("declares every build flag in the rolldown replacements", () => {
    // Unreplaced process.env references would throw in the Max V8 runtime.
    for (const flag of BUILD_FLAGS) {
      expect(rolldownConfig).toContain(`process.env.${flag}`);
    }
  });

  it("keeps runtime flags out of the rolldown replacements", () => {
    for (const flag of RUNTIME_FLAGS) {
      expect(rolldownConfig).not.toContain(flag);
    }
  });

  it("enables every debug flag in build:debug and dev:debug", () => {
    for (const flag of DEBUG_FLAGS) {
      expect(scripts["build:debug"]).toContain(`${flag}=true`);
      expect(scripts["dev:debug"]).toContain(`${flag}=true`);
    }
  });

  it("leaves every flag off in production build scripts", () => {
    expect(scripts.build).not.toMatch(/ENABLE_/);
    expect(scripts.dev).not.toMatch(/ENABLE_/);
  });

  it("never enables opt-in flags from an npm script", () => {
    for (const flag of OPT_IN_FLAGS) {
      expect(Object.values(scripts).join("\n")).not.toContain(flag);
    }
  });

  it("guards every build flag against leaking into CI builds", () => {
    for (const flag of BUILD_FLAGS) {
      expect(ciWorkflow).toContain(`"\${${flag}:-}" = "true"`);
    }
  });
});

describe("build identity", () => {
  // BUILD_SHA is not a feature flag — it's the build's identity, read in
  // src/shared/config.ts so the update check can tell two builds of the same
  // version apart. Every bundler must substitute it: left unreplaced, the
  // `process` reference throws in the Max V8 runtime and the browser bundle.
  it("substitutes BUILD_SHA in the rolldown bundles", () => {
    expect(rolldownConfig).toContain("process.env.BUILD_SHA");
  });

  it("substitutes BUILD_SHA in the chat UI bundle", () => {
    expect(readRepoFile("config/vite.config.ts")).toContain(
      "process.env.BUILD_SHA",
    );
  });
});

/**
 * Collect the build flags read from process.env anywhere in src/
 * @returns Set of flag names
 */
function flagsReadInSrc(): Set<string> {
  const flags = new Set<string>();

  for (const file of findSourceFiles(path.join(projectRoot, "src"), true)) {
    for (const match of fs.readFileSync(file, "utf8").matchAll(FLAG_READ)) {
      flags.add(match[1] as string);
    }
  }

  return flags;
}

/**
 * Read a repo file as text
 * @param relativePath - Path relative to the project root
 * @returns File contents
 */
function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}
