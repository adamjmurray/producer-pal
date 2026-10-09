// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  type RegisteredMockObject,
  noParamLanded,
  updateDevice,
} from "../../update-device-test-helpers.ts";
import {
  KICK,
  registerDrumSamplerOn,
  registerPadRack,
} from "./pad-sample-fixtures.ts";

const REFUSED =
  "sample write SKIPPED on pad t0/d0/pC1/c0 — it holds a Drum Sampler, " +
  "whose sample the Live API can't set. Honoring the write REPLACES it with " +
  "a Simpler, losing all its settings. Ask the user before passing " +
  "force:true. To keep it: load the sample on another pad, or copy the " +
  'instrument to a free pad first (ppal-duplicate type:"device").';

describe("updateDevice - a pad sample named twice, the last refused", () => {
  it("fails the earlier mentions with it", () => {
    const [chain] = registerPadRack();

    registerDrumSamplerOn(chain as RegisteredMockObject);

    const message = noParamLanded(() =>
      updateDevice({
        path: "t0/d0/pC1",
        params: [
          { name: "sample", value: "/snare.wav" },
          { name: "Sample", value: "/hat.wav" },
          { name: "sample", value: KICK },
        ],
      }),
    );

    const replaced =
      'not written: "sample" was meant to replace it, but failed';

    expect(message).toBe(
      `no param landed — "sample": ${replaced}; "Sample": ${replaced}; ` +
        `"sample": ${REFUSED}`,
    );
  });
});
