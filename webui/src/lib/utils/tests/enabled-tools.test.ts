// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { LIVE_API_TOOL_ID } from "#src/shared/tool-groups";
import {
  SPAWN_SUBAGENT_TOOL_NAME,
  enabledToolsDiverge,
  isEnabledToolsMap,
  isToolEnabled,
  withLiveApiTool,
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

describe("withLiveApiTool", () => {
  it("stamps the device flag into a map that has no opinion", () => {
    expect(withLiveApiTool({ "ppal-library": false }, true)).toStrictEqual({
      "ppal-library": false,
      [LIVE_API_TOOL_ID]: true,
    });
    expect(withLiveApiTool({}, false)).toStrictEqual({
      [LIVE_API_TOOL_ID]: false,
    });
  });

  it("leaves a pinned entry alone, however the flag has since moved", () => {
    // The whole point of the pin: a conversation locked while the tool was off
    // must not pick it up when the device flag goes on.
    const pinned = { [LIVE_API_TOOL_ID]: false };

    expect(withLiveApiTool(pinned, true)).toBe(pinned);
  });

  it("reports no divergence for a conversation pinned before it existed", () => {
    // A map from before this shipped has no entry, and no entry is what it
    // reconnects on — it follows the flag, so it hasn't diverged from it.
    const legacy = {};

    for (const flag of [true, false]) {
      expect(
        enabledToolsDiverge(
          withLiveApiTool(legacy, flag),
          withLiveApiTool({}, flag),
        ),
      ).toBe(false);
    }
  });

  it("reports a divergence once the flag moves off a pinned toolset", () => {
    expect(
      enabledToolsDiverge(
        withLiveApiTool({ [LIVE_API_TOOL_ID]: false }, true),
        withLiveApiTool({}, true),
      ),
    ).toBe(true);
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
