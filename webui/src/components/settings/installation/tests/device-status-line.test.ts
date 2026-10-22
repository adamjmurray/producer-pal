// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { deviceStatusLine } from "#webui/components/settings/installation/helpers/device-status-line";
import { deviceStatusBody } from "#webui/components/settings/installation/tests/helpers/installation-fetch-test-helpers";

describe("deviceStatusLine", () => {
  it.each([
    [{}, "Not in your User Library", "warn"],
    [
      { state: "same" as const, installedVersion: "1.2.0" },
      "In your User Library (v1.2.0)",
      "good",
    ],
    [
      { state: "installed-older" as const, installedVersion: "1.1.0" },
      "Update available: v1.1.0 → v1.2.0",
      "warn",
    ],
    [
      { state: "installed-newer" as const, installedVersion: "1.3.0" },
      "The copy in your User Library (v1.3.0) is newer than this device (v1.2.0)",
      "plain",
    ],
    [
      { state: "different" as const, installedVersion: null },
      "The copy in your User Library (an unknown version) differs from this device (v1.2.0)",
      "warn",
    ],
  ])("%j says %j", (overrides, text, tone) => {
    expect(deviceStatusLine(deviceStatusBody(overrides))).toStrictEqual({
      text,
      tone,
    });
  });

  it.each([
    ["not-frozen" as const, "Development build: freeze it to copy."],
    [
      "unknown-source" as const,
      "This device hasn't said where its file is yet. Try Refresh in a moment.",
    ],
    ["unreadable-source" as const, "This device's file can't be read."],
    [
      "no-user-library" as const,
      "Enter your User Library above to check for a copy.",
    ],
  ])("says what a %s problem needs", (problem, text) => {
    expect(
      deviceStatusLine(deviceStatusBody({ problem, state: null })),
    ).toStrictEqual({ text, tone: "plain" });
  });
});
