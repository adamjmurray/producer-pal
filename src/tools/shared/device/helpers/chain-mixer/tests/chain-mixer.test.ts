// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  type RegisteredMockObject,
  keepsParamValue,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  type ChainMixerApplied,
  type ChainMixerParams,
  applyChainMixer,
  readChainMixer,
} from "../chain-mixer.ts";
import {
  chainApi,
  chainPath,
  registerChainWithMixer,
  registerReturnChains,
} from "./chain-mixer-test-helpers.ts";
import { newTargetNotes } from "#src/tools/shared/helpers/target-notes.ts";
import "#src/live-api-adapter/live-api-extensions.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

const SNAPPED = "gainDb read back as shown, not as sent";

/**
 * The entry a send reports when Live kept a level other than the one written
 * @param gainDb - The level read back off the send
 * @param name - The return chain it went to
 * @param returnId - That chain's id
 * @returns The expected send entry
 */
function snappedSend(gainDb: number, name = "a Delay", returnId = "rc-0") {
  return { return: name, returnId, gainDb, detail: SNAPPED };
}

/**
 * Write a mixer onto the registered chain, with an entry of its own
 * @param params - Mixer values to set
 * @returns What landed, read back
 */
function applyMixer(params: ChainMixerParams): ChainMixerApplied {
  return applyChainMixer(chainApi(), params, newTargetNotes());
}

describe("readChainMixer", () => {
  it("returns nothing when every setting is at its default", () => {
    registerChainWithMixer();

    expect(readChainMixer(chainApi())).toStrictEqual({});
  });

  it("returns nothing when the chain has no mixer device", () => {
    mockNonExistentObjects();
    registerMockObject("chain-1", { path: chainPath, type: "Chain" });

    expect(readChainMixer(chainApi())).toStrictEqual({});
  });

  it("reports a non-zero gain and pan, rounding both to Live's display steps", () => {
    registerChainWithMixer({
      gainDb: -6.333000183105469,
      pan: -0.30000001192092896,
    });

    expect(readChainMixer(chainApi())).toStrictEqual({
      gainDb: -6.33,
      pan: -0.3,
    });
  });

  it("treats sub-1% pan as centered rather than reporting pan 0", () => {
    registerChainWithMixer({ pan: 0.004 });

    expect(readChainMixer(chainApi())).toStrictEqual({});
  });

  it("rounds gain and pan when Max serializes a tiny float32 as an exponent string", () => {
    registerChainWithMixer({
      gainDb: "9.999999747378752e-05",
      pan: "9.999999747378752e-05",
    });

    expect(readChainMixer(chainApi())).toStrictEqual({});
  });

  it("names active sends after the rack's return chains and skips silent ones", () => {
    registerChainWithMixer({
      sends: [
        { value: 0, display_value: -70 },
        { value: 0.6, display_value: -12.333000183105469 },
      ],
    });
    registerReturnChains("Delay", "Reverb");

    expect(readChainMixer(chainApi())).toStrictEqual({
      // The id rides along so a read round-trips straight back into `sends`.
      // The gain is rounded: Live's raw float32 is -12.333000183105469.
      sends: [{ return: "Reverb", returnId: "rc-1", gainDb: -12.33 }],
    });
  });

  it("treats a tiny send value Max serialized as an exponent string as active", () => {
    registerChainWithMixer({
      sends: [{ value: "9.999999747378752e-05", display_value: -80.3 }],
    });
    registerReturnChains("Reverb");

    expect(readChainMixer(chainApi())).toStrictEqual({
      sends: [{ return: "Reverb", returnId: "rc-0", gainDb: -80.3 }],
    });
  });

  it("reports an all-digit return chain name as a string", () => {
    // The send result must report it like every other name.
    registerChainWithMixer({
      sends: [{ value: 0.6, display_value: -12 }],
    });
    registerReturnChains(5678);

    expect(readChainMixer(chainApi())).toStrictEqual({
      sends: [{ return: "5678", returnId: "rc-0", gainDb: -12 }],
    });
  });

  it("falls back to a numbered return name when the rack has none", () => {
    registerChainWithMixer({ sends: [{ value: 0.5, display_value: -14 }] });
    registerReturnChains();

    expect(readChainMixer(chainApi())).toStrictEqual({
      sends: [{ return: "Return 1", gainDb: -14 }],
    });
  });

  it("falls back to a numbered return name when Live names no owner for the chain", () => {
    // No rack is registered at the chain's path, so it has no canonical_parent.
    registerChainWithMixer({ sends: [{ value: 0.5, display_value: -14 }] });

    expect(readChainMixer(chainApi())).toStrictEqual({
      sends: [{ return: "Return 1", gainDb: -14 }],
    });
  });

  it("falls back to a numbered return name when the return chain has no name", () => {
    // getName() reports "" for a nameless return chain — `??` would keep that
    // "" instead of falling back, so this must use `||`.
    registerChainWithMixer({ sends: [{ value: 0.5, display_value: -14 }] });
    registerReturnChains("");

    expect(readChainMixer(chainApi())).toStrictEqual({
      sends: [{ return: "Return 1", returnId: "rc-0", gainDb: -14 }],
    });
  });
});

describe("applyChainMixer", () => {
  it("sets volume in dB and pan as a raw value", () => {
    const { volume, panning } = registerChainWithMixer();

    applyMixer({ gainDb: -6, pan: 0.25 });

    expect(volume.set).toHaveBeenCalledWith("display_value", -6);
    expect(panning.set).toHaveBeenCalledWith("value", 0.25);
  });

  it("reports the gain and pan Live kept, not the ones asked for", () => {
    const { volume, panning } = registerChainWithMixer();

    keepsParamValue(volume, -6.02);
    keepsParamValue(panning, 0.25999999046325684);

    const applied = applyMixer({ gainDb: -6, pan: 0.25 });

    expect(applied).toStrictEqual({ gainDb: -6.02, pan: 0.26 });
  });

  // Max serializes an exponent-notation float as a string. Nothing came back to
  // read, so the argument stands in rather than vanishing from the result, and
  // it is rounded the way a read-back would be — reporting the centered pan the
  // argument amounts to, not the sub-1% number the caller wrote.
  it("falls back to the written pan when Live answers with a string", () => {
    const { panning } = registerChainWithMixer();

    keepsParamValue(panning, "9.999999747378752e-05");

    expect(applyMixer({ pan: 0.0001 })).toStrictEqual({
      pan: 0,
    });
  });

  it("leaves the other setting alone when only one is given", () => {
    const { volume, panning } = registerChainWithMixer();

    applyMixer({ pan: -1 });

    expect(volume.set).not.toHaveBeenCalled();
    expect(panning.set).toHaveBeenCalledWith("value", -1);

    applyMixer({ gainDb: -6 });

    expect(volume.set).toHaveBeenCalledWith("display_value", -6);
    expect(panning.set).toHaveBeenCalledTimes(1);
  });

  it("refuses every mixer param when the chain has no mixer device", () => {
    mockNonExistentObjects();
    registerMockObject("chain-1", { path: chainPath, type: "Chain" });
    const notes = newTargetNotes();

    applyChainMixer(chainApi(), { gainDb: -6 }, notes);

    expect(notes.said).toStrictEqual(["the chain has no mixer device"]);
    expect(notes.refused).toStrictEqual(["gainDb"]);
  });

  // Live accepts a set on a macro-mapped parameter and ignores it, so an
  // unguarded write would report success and change nothing.
  it("refuses a macro-mapped gain on the entry, per parameter", () => {
    const { volume, panning } = registerChainWithMixer({
      disabled: ["volume"],
    });
    const notes = newTargetNotes();

    applyChainMixer(chainApi(), { gainDb: -6, pan: 0.25 }, notes);

    expect(volume.set).not.toHaveBeenCalled();
    expect(notes.said).toStrictEqual([
      expect.stringMatching(/^gainDb is disabled/),
    ]);
    expect(notes.refused).toStrictEqual(["gainDb"]);
    expect(capturedWarnings()).toStrictEqual([]);
    // Mapping one parameter must not block the others on the same chain
    expect(panning.set).toHaveBeenCalledWith("value", 0.25);
  });

  it("refuses a macro-mapped pan on the entry", () => {
    const { panning } = registerChainWithMixer({ disabled: ["panning"] });
    const notes = newTargetNotes();

    applyChainMixer(chainApi(), { pan: -1 }, notes);

    expect(panning.set).not.toHaveBeenCalled();
    expect(notes.refused).toStrictEqual(["pan"]);
  });

  describe("sends", () => {
    const silent = { value: 0, display_value: -70 };

    /**
     * Register the chain with two silent sends and name the rack's return chains
     * @param returnNames - Return chain names in send order
     * @returns The registered send parameters
     */
    function registerChainWithSends(
      returnNames: string[] = ["a Delay", "b Reverb"],
    ): RegisteredMockObject[] {
      registerChainWithMixer({ sends: [silent, silent] });
      registerReturnChains(...returnNames);

      return [
        registerMockObject("send-0", { type: "DeviceParameter" }),
        registerMockObject("send-1", { type: "DeviceParameter" }),
      ];
    }

    /**
     * A chain with the usual sends, whose first send reads back `kept`
     * whatever is written to it — the way Live clamps and snaps one.
     * @param kept - The level the send ends up holding
     * @returns The first send's param mock
     */
    function sendKeeping(kept: number): RegisteredMockObject {
      const [first] = registerChainWithSends();
      const send = first as RegisteredMockObject;

      keepsParamValue(send, kept);

      return send;
    }

    it("sets the send matched by exact return chain name", () => {
      const [first, second] = registerChainWithSends();

      applyMixer({ sendGainDb: -12, sendReturn: "b Reverb" });

      expect(second?.set).toHaveBeenCalledWith("display_value", -12);
      expect(first?.set).not.toHaveBeenCalled();
    });

    it("matches a return chain by its letter, ignoring case", () => {
      const [first] = registerChainWithSends();

      applyMixer({ sendGainDb: 0, sendReturn: "A" });

      expect(first?.set).toHaveBeenCalledWith("display_value", 0);
    });

    it("matches a return chain by id", () => {
      // Same name on both: no name or letter tells them apart, so this is the
      // case only an id can address.
      const [first, second] = registerChainWithSends(["Verb", "Verb"]);

      applyMixer({ sendGainDb: -12, sendReturn: "rc-1" });

      expect(second?.set).toHaveBeenCalledWith("display_value", -12);
      expect(first?.set).not.toHaveBeenCalled();
    });

    it("says on the entry when an id is also another return's name", () => {
      // "rc-1" is the second return's id and the first one's name.
      const [first, second] = registerChainWithSends(["rc-1", "b Reverb"]);

      const applied = applyMixer({ sendGainDb: -12, sendReturn: "rc-1" });

      expect(second?.set).toHaveBeenCalledWith("display_value", -12);
      expect(first?.set).not.toHaveBeenCalled();
      expect(applied.sends).toStrictEqual([
        {
          return: "b Reverb",
          returnId: "rc-1",
          gainDb: expect.any(Number),
          detail: 'matched by id; "rc-1" is also the name of "rc-1"',
        },
      ]);
      expect(capturedWarnings()).toStrictEqual([]);
    });

    it("keeps the clash on a send a later one replaced", () => {
      registerChainWithSends(["rc-1", "b Reverb"]);

      const applied = applyMixer({
        sends: [
          { return: "rc-1", gainDb: -6 },
          { return: "b Reverb", gainDb: -9 },
        ],
      });

      expect(applied.sends?.[0]).toStrictEqual({
        return: "b Reverb",
        returnId: "rc-1",
        detail: expect.stringMatching(
          /; matched by id; "rc-1" is also the name of "rc-1"$/,
        ),
      });
    });

    it("keeps the clash on a send refused for want of a send", () => {
      // The first return's name is the third return's id.
      registerChainWithSends(["rc-2", "b Reverb", "c Chorus"]);

      expect(
        applyMixer({ sendGainDb: -6, sendReturn: "rc-2" }).sends,
      ).toStrictEqual([
        {
          return: "rc-2",
          returnId: "rc-2",
          ok: false,
          detail:
            'the chain has no send for this return; matched by id; "rc-2" is also the name of "rc-2"',
        },
      ]);
    });

    it("keeps the clash on a macro-mapped send's refusal", () => {
      registerChainWithSends(["rc-1", "b Reverb"]);
      registerMockObject("send-1", {
        type: "DeviceParameter",
        properties: { is_enabled: 0 },
      });

      expect(
        applyMixer({ sendGainDb: -6, sendReturn: "rc-1" }).sends,
      ).toStrictEqual([
        {
          return: "b Reverb",
          returnId: "rc-1",
          ok: false,
          detail: expect.stringMatching(
            /^gainDb is disabled.*; matched by id; "rc-1" is also the name of "rc-1"$/,
          ),
        },
      ]);
    });

    // The tools refuse a half pair before they reach a chain, so by here it is
    // "neither was sent": write nothing, and say nothing either.
    it("ignores only one of sendGainDb and sendReturn", () => {
      const sends = registerChainWithSends();

      applyMixer({ sendGainDb: -6 });
      applyMixer({ sendReturn: "a" });

      expect(capturedWarnings()).toStrictEqual([]);
      expect(sends[0]?.set).not.toHaveBeenCalled();
    });

    it("lists the available returns when none matches", () => {
      registerChainWithSends();

      const applied = applyMixer({
        sendGainDb: -6,
        sendReturn: "Chorus",
      });

      expect(applied.sends).toStrictEqual([
        {
          return: "Chorus",
          ok: false,
          detail:
            'no return chain matching "Chorus" (returns: a Delay, b Reverb)',
        },
      ]);
      expect(capturedWarnings()).toStrictEqual([]);
    });

    it("says so when the rack has no return chains", () => {
      registerChainWithSends([]);

      const applied = applyMixer({
        sendGainDb: -6,
        sendReturn: "a",
      });

      expect(applied.sends).toStrictEqual([
        {
          return: "a",
          ok: false,
          detail:
            'no return chain matching "a" (rack has no return chains; they can only be added in Live)',
        },
      ]);
      expect(capturedWarnings()).toStrictEqual([]);
    });

    it("keeps a macro-mapped send's slot as refused", () => {
      registerChainWithSends();
      const send = registerMockObject("send-1", {
        type: "DeviceParameter",
        properties: { is_enabled: 0 },
      });

      const applied = applyMixer({ sendGainDb: -12, sendReturn: "b Reverb" });

      expect(send.set).not.toHaveBeenCalled();
      expect(applied.sends).toStrictEqual([
        {
          return: "b Reverb",
          returnId: "rc-1",
          ok: false,
          detail: expect.stringMatching(/^gainDb is disabled/),
        },
      ]);
      expect(capturedWarnings()).toStrictEqual([]);
    });

    // A send holds one value, so a return named twice is one write: the later
    // mention is refused, and the earlier one was not written either — as
    // update-track does.
    it("refuses a macro-mapped send named twice, the earlier one unwritten", () => {
      registerChainWithSends();
      registerMockObject("send-1", {
        type: "DeviceParameter",
        properties: { is_enabled: 0 },
      });

      const applied = applyMixer({
        sendGainDb: -12,
        sendReturn: "b Reverb",
        sends: [
          { return: "b", gainDb: -6 },
          { return: "a Delay", gainDb: -3 },
        ],
      });

      expect(applied.sends?.filter((send) => send.ok === false)).toStrictEqual([
        {
          return: "b Reverb",
          returnId: "rc-1",
          ok: false,
          detail: 'not written: "b Reverb" was meant to replace it, but failed',
        },
        {
          return: "b Reverb",
          returnId: "rc-1",
          ok: false,
          detail: expect.stringMatching(/^gainDb is disabled/),
        },
      ]);
    });

    it("refuses the send when the chain has fewer than the rack has returns", () => {
      registerChainWithSends(["a Delay", "b Reverb", "c Chorus"]);

      expect(
        applyMixer({ sendGainDb: -6, sendReturn: "c" }).sends,
      ).toStrictEqual([
        {
          return: "c",
          returnId: "rc-2",
          ok: false,
          detail: "the chain has no send for this return",
        },
      ]);
      expect(capturedWarnings()).toStrictEqual([]);
    });

    // The `sends` list is the multi-send spelling. It reuses the single-send
    // path, so only the list behavior itself needs covering here.
    describe("as a list", () => {
      it("sets every send in one call", () => {
        const [first, second] = registerChainWithSends();

        keepsParamValue(first as RegisteredMockObject, -6.02);
        keepsParamValue(second as RegisteredMockObject, -11.98);

        const applied = applyMixer({
          sends: [
            { return: "a Delay", gainDb: -6 },
            { return: "b Reverb", gainDb: -12 },
          ],
        });

        expect(first?.set).toHaveBeenCalledWith("display_value", -6);
        expect(second?.set).toHaveBeenCalledWith("display_value", -12);
        // Keyed by the return that resolved, with the id a write can quote
        // back, and the level read off the send — Live kept neither argument.
        expect(applied.sends).toStrictEqual([
          snappedSend(-6.02),
          snappedSend(-11.98, "b Reverb", "rc-1"),
        ]);
      });

      it("reports the entries that landed and the ones that named nothing", () => {
        const first = sendKeeping(-6.02);

        const applied = applyMixer({
          sends: [
            { return: "a Delay", gainDb: -6 },
            { return: "nope", gainDb: -12 },
          ],
        });

        expect(first.set).toHaveBeenCalledWith("display_value", -6);
        expect(applied.sends).toStrictEqual([
          snappedSend(-6.02),
          {
            return: "nope",
            ok: false,
            detail:
              'no return chain matching "nope" (returns: a Delay, b Reverb)',
          },
        ]);
        expect(capturedWarnings()).toStrictEqual([]);
      });

      it("honors both the scalar pair and the list in one call", () => {
        const [first, second] = registerChainWithSends();

        applyMixer({
          sendGainDb: -3,
          sendReturn: "a Delay",
          sends: [{ return: "b Reverb", gainDb: -12 }],
        });

        expect(first?.set).toHaveBeenCalledWith("display_value", -3);
        expect(second?.set).toHaveBeenCalledWith("display_value", -12);
      });

      const REPLACED = {
        return: "a Delay",
        returnId: "rc-0",
        detail: "named again later in this call",
      };

      // Applies a call whose last write to "a Delay" is -12 and expects the
      // earlier write's entry to say it was replaced.
      function expectFirstWriteReplaced(params: ChainMixerParams): void {
        const first = sendKeeping(-11.98);

        const applied = applyMixer(params);

        expect(first.set).toHaveBeenLastCalledWith("display_value", -12);
        expect(applied.sends).toStrictEqual([REPLACED, snappedSend(-11.98)]);
        expect(capturedWarnings()).toStrictEqual([]);
      }

      it("lets the list win when it names the same return as the pair", () => {
        // The pair is the one replaced, and says so on its own entry.
        expectFirstWriteReplaced({
          sendGainDb: -3,
          sendReturn: "a Delay",
          sends: [{ return: "a Delay", gainDb: -12 }],
        });
      });

      // A send holds one value, so the second write overwrites the first — and
      // two spellings of one return are still one send.
      it.each([
        ["the list names one twice", "a Delay"],
        ["two spellings name the same one", "a"],
      ])("reports the replaced entry when %s", (_case, secondReturn) => {
        // Named by the return that resolved, not by either spelling.
        expectFirstWriteReplaced({
          sends: [
            { return: "a Delay", gainDb: -6 },
            { return: secondReturn, gainDb: -12 },
          ],
        });
      });

      it("reports each entry a later one replaced", () => {
        sendKeeping(-70);

        const applied = applyMixer({
          sends: [
            { return: "a Delay", gainDb: -6 },
            { return: "a Delay", gainDb: -9 },
            { return: "a Delay", gainDb: -12 },
          ],
        });

        expect(applied.sends).toStrictEqual([
          REPLACED,
          REPLACED,
          snappedSend(-70),
        ]);
        expect(capturedWarnings()).toStrictEqual([]);
      });

      // Live clamps a send to -70..0 and hands the level back as a 32-bit
      // float, so the argument is not what the send ends up holding.
      describe("read back off the send", () => {
        it("reports the level Live kept, not the one asked for", () => {
          sendKeeping(-70);

          const applied = applyMixer({
            sends: [{ return: "a Delay", gainDb: -100 }],
          });

          expect(applied.sends).toStrictEqual([snappedSend(-70)]);
        });

        it("rounds the raw float32 to Live's display resolution", () => {
          const [first] = registerChainWithSends();

          // Live snapped the request to a nearby step and handed back its raw
          // float32, so the rounded read-back is not the rounded argument.
          keepsParamValue(first as RegisteredMockObject, -6.333000183105469);

          const applied = applyMixer({
            sends: [{ return: "a Delay", gainDb: -6.5 }],
          });

          expect(applied.sends).toStrictEqual([snappedSend(-6.33)]);
        });

        // Max serializes an exponent-notation float as a string. The level
        // landed, so the written level stands in — and it has nothing to say.
        it("falls back to the written level when Live answers with a string", () => {
          const [first] = registerChainWithSends();

          keepsParamValue(
            first as RegisteredMockObject,
            "-1.000000013351432e-01",
          );

          const applied = applyMixer({
            sends: [{ return: "a Delay", gainDb: -0.1 }],
          });

          expect(applied.sends).toStrictEqual([
            { return: "a Delay", returnId: "rc-0", gainDb: -0.1 },
          ]);
        });
      });

      it("writes nothing for an empty list", () => {
        const [first, second] = registerChainWithSends();

        const applied = applyMixer({ sends: [] });

        expect(first?.set).not.toHaveBeenCalled();
        expect(second?.set).not.toHaveBeenCalled();
        expect(applied.sends).toBeUndefined();
      });
    });
  });
});
