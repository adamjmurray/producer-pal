// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A scene position Live won't take refuses the call before any copy.

import { describe, expect, it, vi } from "vitest";
import "../duplicate-mocks-test-helpers.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  createStandardMidiClipMock,
  registerClipSlot,
  setupArrangementSceneMocks,
} from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";
import { registerTrackWithArrangementDup } from "#src/tools/actions/duplicate/helpers/duplicate-arrangement-test-helpers.ts";

describe("duplicate scene - a position past the last Live allows", () => {
  it("refuses a scene call before any copy", async () => {
    setupArrangementSceneMocks(1);
    registerClipSlot(0, 0, true, createStandardMidiClipMock());

    const track = registerTrackWithArrangementDup(0);

    await expect(
      duplicate({ type: "scene", id: "scene1", arrangementStart: "394202|1" }),
    ).rejects.toThrow(
      "arrangementStart is past the last position Live allows (394201|1)",
    );

    expect(vi.mocked(track.call)).not.toHaveBeenCalled();
  });
});
