// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import { createClip } from "../../create-clip.ts";
import { setupSessionMocks } from "../create-clip-test-helpers.ts";

// 64 hats (8 bars x 8) plus a kick on bar 5 that `@6-8=5` copies to bars 6-8
// together with the hats already on bar 5, so the interpreted notes hold 24
// duplicate hats. D1 is 6 notes.
const NOTES =
  "v45 n/16 Gb1 1|1x8@n/8 v60 B1 1|2.5 @2-8=1 v95 C1 5|1,2,3,4 @6-8=5 v60 D1 8|3.5x6@n/16";

describe("createClip - transformed count", () => {
  it("counts a note once when the write path collapses its duplicates", async () => {
    setupSessionMocks({
      liveSet: { signature_numerator: 4, signature_denominator: 4 },
    });

    const result = await createClip({
      slot: "0/0",
      length: "8bar",
      notes: NOTES,
      transforms:
        "Gb1: velocity = clamp(note.velocity * 1.1, 8, 127)\nD1 8|3.5-8|4.75: velocity = ramp(50, 120)",
    });

    // 64 hats + 6 D1, not 94
    expect(result).toStrictEqual(expect.objectContaining({ transformed: 70 }));
  });

  it("keeps earlier lines' notes when a later note op is skipped", async () => {
    setupSessionMocks({
      liveSet: { signature_numerator: 4, signature_denominator: 4 },
    });

    const result = await createClip({
      slot: "0/0",
      notes: "v100 C3 1|1 D3 1|2 E3 1|3",
      transforms: "C3: velocity += 0\nD3: velocity += 0\nC3: ratchet(1)",
    });

    expect(result).toStrictEqual(expect.objectContaining({ transformed: 2 }));
  });

  describe("deleted duplicates", () => {
    // The bar copy makes 88 interpreted hats; 64 are written, so 64 are deleted.
    it.each(["velocity = 0", "duration = 0"])(
      "counts each deleted slot once: Gb1 %s",
      async (assignment) => {
        setupSessionMocks({
          liveSet: { signature_numerator: 4, signature_denominator: 4 },
        });

        const result = await createClip({
          slot: "0/0",
          length: "8bar",
          notes: NOTES,
          transforms: `Gb1: ${assignment}`,
        });

        expect(result).toStrictEqual(
          expect.objectContaining({ transformed: 64 }),
        );
      },
    );

    it("counts the deduped set on the clip's entry", async () => {
      setupSessionMocks({
        liveSet: { signature_numerator: 4, signature_denominator: 4 },
      });

      const result = await createClip({
        slot: "0/0",
        length: "8bar",
        notes: NOTES,
        transforms: "Gb1: duration = 0",
      });

      expect(result).toStrictEqual(
        expect.objectContaining({
          detail: expect.stringContaining(
            "64 note(s) deleted: duration went to 0 or below",
          ),
        }),
      );
      expect(capturedWarnings()).toStrictEqual([]);
    });
  });
});
