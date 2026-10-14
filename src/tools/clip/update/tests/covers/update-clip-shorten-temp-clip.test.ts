// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Shortening cuts the clip with a temp clip. A temp clip Live won't delete
// doesn't hide that the clip was cut.

import { describe, expect, it } from "vitest";
import {
  overrideCall,
  USE_CALL_FALLBACK,
} from "#src/test/helpers/mock-registry-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import { setUpLane } from "../move-order/lane-with-clips-test-helpers.ts";

describe("shortening a clip when Live won't delete the temp clip", () => {
  it("keeps the clip's entry and says what stayed", async () => {
    const track = setUpLane([{ id: "100", start: 0, length: 16 }]);

    overrideCall(track, (method: string) => {
      if (method === "delete_clip") {
        throw new Error("Live refused delete_clip");
      }

      return USE_CALL_FALLBACK;
    });

    const result = await updateClip({ id: "100", arrangementLength: "2bar" });

    expect(result).toStrictEqual({
      id: "100",
      path: "t0[1|1]",
      detail:
        "couldn't remove the temp arrangement clip (Live refused delete_clip)",
    });
  });
});
