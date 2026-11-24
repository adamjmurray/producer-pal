// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { type ChainMixerApplied, applyChainMixer } from "../chain-mixer.ts";
import {
  chainApi,
  registerChainWithSends,
} from "./chain-mixer-test-helpers.ts";
import { newTargetNotes } from "#src/tools/shared/helpers/target-notes.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

/**
 * Send to a return of the registered chain.
 * @param sendReturn - The return as the caller names it
 * @returns What landed
 */
function sendTo(sendReturn: string): ChainMixerApplied {
  return applyChainMixer(
    chainApi(),
    { sendGainDb: -12, sendReturn },
    newTargetNotes(),
  );
}

// A read names a nameless return chain "Return <n>", so a write takes that.
describe("applyChainMixer sends to a nameless return chain", () => {
  it("takes the label a read gives it", () => {
    const [first, second] = registerChainWithSends(["a Delay", ""]);

    const applied = sendTo("return 2");

    expect(second?.set).toHaveBeenCalledWith("display_value", -12);
    expect(first?.set).not.toHaveBeenCalled();
    expect(applied.sends?.[0]?.return).toBe("Return 2");
  });

  it("prefers a return chain really named that", () => {
    const [first, second] = registerChainWithSends(["", "Return 1"]);

    sendTo("Return 1");

    expect(second?.set).toHaveBeenCalledWith("display_value", -12);
    expect(first?.set).not.toHaveBeenCalled();
  });

  it("lists it by that label when nothing matches", () => {
    registerChainWithSends(["a Delay", ""]);

    expect(sendTo("Chorus").sends).toStrictEqual([
      {
        return: "Chorus",
        ok: false,
        detail:
          'no return chain matching "Chorus" (returns: a Delay, Return 2)',
      },
    ]);
  });
});
