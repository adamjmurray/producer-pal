// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { createSimpleRoutingMock } from "#src/test/mocks/routing-mock-helpers.ts";
import { readLiveSet } from "#src/tools/live-set/read-live-set.ts";
import { setupRoutingTestMocks } from "./update-live-set-test-helpers.ts";

describe("readLiveSet - routing", () => {
  it("includes routing information in tracks when includeRoutings is true", () => {
    setupRoutingTestMocks({ trackProps: createSimpleRoutingMock() });

    const result = readLiveSet({
      include: ["regular-tracks", "routings"],
    });

    const tracks = result.tracks as Record<string, unknown>[];

    expect(tracks[0]).toStrictEqual(
      expect.objectContaining({
        name: "Test Track",
        inputRoutingChannel: { name: "In 1", inputId: "1" },
        inputRoutingType: { name: "Ext. In", inputId: "17" },
        outputRoutingChannel: { name: "Master", outputId: "26" },
        outputRoutingType: { name: "Track Out", outputId: "25" },
        monitoringState: "auto",
      }),
    );

    // Verify that available routing properties are NOT included (read-live-set doesn't support them)
    expect(tracks[0]).not.toHaveProperty("availableInputRoutingChannels");
    expect(tracks[0]).not.toHaveProperty("availableInputRoutingTypes");
    expect(tracks[0]).not.toHaveProperty("availableOutputRoutingChannels");
    expect(tracks[0]).not.toHaveProperty("availableOutputRoutingTypes");
  });

  it("excludes routing information from tracks when includeRoutings is false", () => {
    setupRoutingTestMocks();

    const result = readLiveSet({
      include: ["regular-tracks"],
    });

    const tracks = result.tracks as Record<string, unknown>[];

    expect(tracks[0]).toStrictEqual(
      expect.objectContaining({
        name: "Test Track",
      }),
    );
    // Verify routing properties are not present
    expect(tracks[0]!.availableInputRoutingChannels).toBeUndefined();
    expect(tracks[0]!.availableInputRoutingTypes).toBeUndefined();
    expect(tracks[0]!.availableOutputRoutingChannels).toBeUndefined();
    expect(tracks[0]!.availableOutputRoutingTypes).toBeUndefined();
    expect(tracks[0]!.inputRoutingChannel).toBeUndefined();
    expect(tracks[0]!.inputRoutingType).toBeUndefined();
    expect(tracks[0]!.outputRoutingChannel).toBeUndefined();
    expect(tracks[0]!.outputRoutingType).toBeUndefined();
    expect(tracks[0]!.monitoringState).toBeUndefined();
  });
});
