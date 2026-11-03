// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { loadWrapper } from "./wrapper-test-helpers.ts";

describe("wrapper unmapSlot", () => {
  it("refuses with no plug-in loaded, keeping the stored mappings", () => {
    const rig = loadWrapper(null);

    rig.run("slotsReady = true");

    // The rig has no vstslots object, so a save would throw something else.
    expect(() => rig.run("unmapSlot({ slot: 1 })")).toThrow(
      "no plug-in loaded",
    );
  });
});
