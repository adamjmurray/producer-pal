// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Lengthening clears the clip's way with a temp clip. A temp clip Live won't
// delete doesn't hide that the clip grew, or what it overwrote.

import { describe, expect, it } from "vitest";
import {
  overrideCall,
  USE_CALL_FALLBACK,
} from "#src/test/helpers/mock-registry-test-helpers.ts";
import {
  lookupMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { resizesLikeLiveClip } from "#src/test/mocks/registry/mock-clip-resize.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import { setUpLane } from "../move-order/lane-with-clips-test-helpers.ts";

describe("lengthening a clip when Live won't delete the temp clip", () => {
  it("keeps the clip's entry and says what stayed", async () => {
    const track = setUpLane([
      { id: "100", start: 0, length: 16 },
      { id: "101", start: 20, length: 8 },
    ]);

    resizesLikeLiveClip(lookupMockObject("100") as RegisteredMockObject);

    overrideCall(track, (method: string) => {
      if (method === "delete_clip") {
        throw new Error("Live refused delete_clip");
      }

      return USE_CALL_FALLBACK;
    });

    const result = await updateClip({ id: "100", arrangementLength: "8bar" });

    expect(result).toStrictEqual({
      id: "100",
      path: "t0[1|1]",
      detail:
        "couldn't remove the temp arrangement clip (Live refused delete_clip); " +
        "overwrote the clip at t0[6|1]",
    });
  });
});
