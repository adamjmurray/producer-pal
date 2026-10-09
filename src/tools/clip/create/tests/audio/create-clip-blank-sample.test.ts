// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { createClip } from "../../create-clip.ts";
import {
  expectNotesAdded,
  note,
  setupSessionMocks,
} from "../create-clip-test-helpers.ts";

vi.mock(import("#src/tools/session/select.ts"), () => ({
  select: vi.fn(),
}));

describe("createClip - blank sampleFile", () => {
  // sampleFile:"" means no sample everywhere else, so the clip is MIDI and its
  // transforms run like they would with sampleFile omitted.
  it("makes a MIDI clip and runs its transforms", async () => {
    const { clip } = setupSessionMocks({
      liveSet: { signature_numerator: 4, signature_denominator: 4 },
    });

    const result = await createClip({
      slot: "0/0",
      notes: "v100 C3 1|1",
      transforms: "velocity += 10",
      sampleFile: "",
    });

    expectNotesAdded(clip, [note(60, 0, 1, 110)]);
    expect((result as { detail?: string }).detail).toBeUndefined();
  });

  it("keeps the MIDI timing params", async () => {
    const { clipSlot } = setupSessionMocks({
      liveSet: { signature_numerator: 4, signature_denominator: 4 },
    });

    await createClip({
      slot: "0/0",
      notes: "C3 1|1",
      length: "2bar",
      sampleFile: "",
    });

    expect(clipSlot.call).toHaveBeenCalledWith("create_clip", 8);
  });
});
