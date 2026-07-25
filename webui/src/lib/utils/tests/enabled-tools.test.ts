// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { SPAWN_SUBAGENT_TOOL_NAME } from "#webui/chat/sdk/subagent/spawn-subagent-tool";
import {
  enabledToolsDiverge,
  isEnabledToolsMap,
  isToolEnabled,
} from "#webui/lib/utils/enabled-tools";

describe("isToolEnabled", () => {
  it("treats an absent ordinary tool as enabled", () => {
    expect(isToolEnabled({}, "ppal-read-clip")).toBe(true);
  });

  it("treats an explicit false as disabled", () => {
    expect(isToolEnabled({ "ppal-read-clip": false }, "ppal-read-clip")).toBe(
      false,
    );
  });

  it("treats an absent subagent tool as disabled", () => {
    // Subagent is the one opt-in entry: absent means off, not on.
    expect(isToolEnabled({}, SPAWN_SUBAGENT_TOOL_NAME)).toBe(false);
    expect(
      isToolEnabled(
        { [SPAWN_SUBAGENT_TOOL_NAME]: true },
        SPAWN_SUBAGENT_TOOL_NAME,
      ),
    ).toBe(true);
  });
});

describe("enabledToolsDiverge", () => {
  it("is false for maps that enable the same tools", () => {
    expect(
      enabledToolsDiverge({}, { "ppal-read-clip": true, "ppal-library": true }),
    ).toBe(false);
  });

  it("is true when one map disables a tool the other leaves on", () => {
    expect(enabledToolsDiverge({ "ppal-library": false }, {})).toBe(true);
  });

  it("is true when only the subagent tool differs", () => {
    expect(enabledToolsDiverge({ [SPAWN_SUBAGENT_TOOL_NAME]: true }, {})).toBe(
      true,
    );
  });

  it("is false for two empty maps", () => {
    expect(enabledToolsDiverge({}, {})).toBe(false);
  });
});

describe("isEnabledToolsMap", () => {
  it("accepts a boolean map", () => {
    expect(isEnabledToolsMap({ "ppal-library": false })).toBe(true);
    expect(isEnabledToolsMap({})).toBe(true);
  });

  it("rejects non-objects, arrays, and non-boolean values", () => {
    expect(isEnabledToolsMap(null)).toBe(false);
    expect(isEnabledToolsMap("ppal-library")).toBe(false);
    expect(isEnabledToolsMap(["ppal-library"])).toBe(false);
    expect(isEnabledToolsMap({ "ppal-library": "yes" })).toBe(false);
  });
});
