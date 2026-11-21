// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Max's Live API can't read a CC Control's name or on/off state. A track read
// lists it as a MIDI effect named for its class, and leaves both out rather
// than reporting a blank name and an off device.

import { describe, expect, it } from "vitest";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerCcControl } from "#src/tools/device/tests/helpers/cc-control-fixtures.ts";
import { setupTrackMock } from "../helpers/read-track-registry-test-helpers.ts";
import { readOneTrack } from "../../read-track.ts";

describe("readOneTrack - CC Control", () => {
  it("lists it as a MIDI effect, with no name and not deactivated", () => {
    setupTrackMock({
      trackId: "track1",
      properties: { devices: children("cc-1") },
    });
    registerCcControl();

    const result = readOneTrack({ trackIndex: 0, include: ["devices"] });

    expect(result.devices).toStrictEqual([
      { id: "cc-1", path: "t0/d0", type: "midi-effect: CC Control" },
    ]);
  });
});
