// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { buildFlagGuard, DEV_BUILD_OVERRIDE } from "./build-flag-guard.ts";

describe("buildFlagGuard", () => {
  it("allows a build from a clean environment", () => {
    expect(buildFlagGuard({ PATH: "/usr/bin", BUILD_SHA: "abc1234" })).toBe(
      null,
    );
  });

  it("refuses a build carrying a dev flag, naming it and its value", () => {
    const refusal = buildFlagGuard({ ENABLE_CODE_EXEC: "true" });

    expect(refusal).toContain("ENABLE_CODE_EXEC=true");
    expect(refusal).toContain("npm run build:debug");
  });

  it("refuses a flag set to anything, not just true", () => {
    // The point is to prove the release environment is clean, so a value that
    // happens not to switch the flag on is still a shell that isn't.
    expect(buildFlagGuard({ ENABLE_CODE_EXEC: "1" })).toContain(
      "ENABLE_CODE_EXEC=1",
    );
  });

  it("ignores an ENABLE_ var that isn't one of the build's", () => {
    // ENABLE_* is not this project's namespace: GitHub's runners export
    // ENABLE_RUNNER_TRACING, and matching the prefix refused to build in CI.
    expect(buildFlagGuard({ ENABLE_RUNNER_TRACING: "true" })).toBe(null);
  });

  it("names every flag that is set", () => {
    const refusal = buildFlagGuard({
      ENABLE_LIVE_API: "true",
      ENABLE_REMOTE_CORS: "true",
    });

    expect(refusal).toContain("ENABLE_LIVE_API=true");
    expect(refusal).toContain("ENABLE_REMOTE_CORS=true");
  });

  it("ignores an empty or unset flag", () => {
    expect(
      buildFlagGuard({ ENABLE_CODE_EXEC: "", ENABLE_LIVE_API: undefined }),
    ).toBe(null);
  });

  it("ignores a runtime flag, which the build never substitutes", () => {
    expect(buildFlagGuard({ ENABLE_LOGGING: "true" })).toBe(null);
  });

  it("still guards when the override is spelled some other way", () => {
    expect(
      buildFlagGuard({
        [DEV_BUILD_OVERRIDE]: "false",
        ENABLE_CODE_EXEC: "true",
      }),
    ).toContain("ENABLE_CODE_EXEC=true");
  });

  it("lets a build opt in on purpose", () => {
    expect(
      buildFlagGuard({
        [DEV_BUILD_OVERRIDE]: "true",
        ENABLE_CODE_EXEC: "true",
      }),
    ).toBe(null);
  });
});
