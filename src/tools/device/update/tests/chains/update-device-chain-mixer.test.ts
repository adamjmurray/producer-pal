// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import {
  beginLiveApiScope,
  endLiveApiScope,
} from "#src/live-api-adapter/live-api-release.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  keepsParamValue,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { updateDevice } from "../../update-device.ts";
import "#src/live-api-adapter/live-api-extensions.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

const SNAPPED_SEND = "gainDb read back as shown, not as sent";

describe("updateDevice - chain mixer (gainDb, pan, sends)", () => {
  const rackPath = livePath.track(0).device(0);
  const chainPath = rackPath.chain(0);
  const mixerPath = `${chainPath} mixer_device`;
  let volume: RegisteredMockObject;
  let panning: RegisteredMockObject;
  let send: RegisteredMockObject;

  beforeEach(() => {
    registerMockObject("chain-0", { path: chainPath, type: "DrumChain" });
    registerMockObject("mixer-0", {
      path: mixerPath,
      properties: { sends: children("send-0") },
    });
    send = registerMockObject("send-0");
    registerMockObject("rack-0", {
      path: rackPath,
      properties: { return_chains: children("rc-0") },
    });
    registerMockObject("rc-0", { properties: { name: "a Reverb" } });
    volume = registerMockObject("volume-0", {
      path: `${mixerPath} volume`,
      properties: { display_value: 0 },
    });
    panning = registerMockObject("panning-0", {
      path: `${mixerPath} panning`,
      properties: { value: 0 },
    });
  });

  /**
   * Write -12 dB to the chain's one send, on a send Live leaves at `kept`.
   * @param kept - The level the send ends up holding
   * @returns What updateDevice reported
   */
  function writeSendKeeping(kept: number): unknown {
    keepsParamValue(send, kept);

    const result = updateDevice({
      id: "chain-0",
      sends: [{ return: "a", gainDb: -12 }],
    });

    expect(send.set).toHaveBeenCalledWith("display_value", -12);

    return result;
  }

  it("sets a chain's own gain and pan", () => {
    // Live kept a different gain and the pan asked for (its float32 noise is
    // the same value), so only the gain has anything to report.
    keepsParamValue(volume, -15.02);
    keepsParamValue(panning, -0.30000001192092896);

    const result = updateDevice({ id: "chain-0", gainDb: -15, pan: -0.3 });

    expect(volume.set).toHaveBeenCalledWith("display_value", -15);
    expect(panning.set).toHaveBeenCalledWith("value", -0.3);
    expect(result).toStrictEqual({
      id: "chain-0",
      path: "t0/d0/c0",
      gainDb: -15.02,
      detail: "gainDb read back as shown, not as sent",
    });
  });

  it("reports a chain pan Live didn't keep, and names both in one reason", () => {
    keepsParamValue(volume, -15.02);
    keepsParamValue(panning, -0.26);

    expect(
      updateDevice({ id: "chain-0", gainDb: -15, pan: -0.3 }),
    ).toStrictEqual({
      id: "chain-0",
      path: "t0/d0/c0",
      gainDb: -15.02,
      pan: -0.26,
      detail: "gainDb, pan read back as shown, not as sent",
    });
  });

  it("says nothing about a chain gain and pan that landed as asked", () => {
    keepsParamValue(volume, -15);
    keepsParamValue(panning, -0.3);

    expect(
      updateDevice({ id: "chain-0", gainDb: -15, pan: -0.3 }),
    ).toStrictEqual({ id: "chain-0", path: "t0/d0/c0" });
  });

  // A level Live changed was invisible to the model that asked for it.
  it("reports a send whose level Live changed, keyed by its return", () => {
    const result = writeSendKeeping(-11.98);

    expect(result).toStrictEqual({
      id: "chain-0",
      path: "t0/d0/c0",
      sends: [
        {
          return: "a Reverb",
          returnId: "rc-0",
          gainDb: -11.98,
          detail: SNAPPED_SEND,
        },
      ],
    });
  });

  it("says nothing about a send that took the level asked for", () => {
    expect(writeSendKeeping(-12)).toStrictEqual({
      id: "chain-0",
      path: "t0/d0/c0",
    });
  });

  it("reports the sendGainDb/sendReturn pair under sends as well", () => {
    keepsParamValue(send, -6.02);

    const result = updateDevice({
      id: "chain-0",
      sendGainDb: -6,
      sendReturn: "a",
    });

    // One send has one shape, whichever param spelled it.
    expect(result).toStrictEqual({
      id: "chain-0",
      path: "t0/d0/c0",
      sends: [
        {
          return: "a Reverb",
          returnId: "rc-0",
          gainDb: -6.02,
          detail: SNAPPED_SEND,
        },
      ],
    });
  });

  // The rack's return chains belong to the rack, so this is about the chain the
  // call named. It asked for nothing else, so the call throws naming the send.
  it("refuses a lone send whose return name matches none", () => {
    expect(() =>
      updateDevice({ id: "chain-0", sends: [{ return: "nope", gainDb: -12 }] }),
    ).toThrow(
      'no send landed — "nope": no return chain matching "nope" (returns: a Reverb)',
    );
    expect(send.set).not.toHaveBeenCalled();
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("gives each chain its own sendReturn", () => {
    const secondMixer = `${rackPath.chain(1)} mixer_device`;

    registerMockObject("rack-0", {
      path: rackPath,
      properties: { return_chains: children("rc-0", "rc-1") },
    });
    registerMockObject("rc-1", { properties: { name: "b Delay" } });
    registerMockObject("chain-1", {
      path: rackPath.chain(1),
      type: "DrumChain",
    });
    registerMockObject("mixer-1", {
      path: secondMixer,
      properties: { sends: children("send-1a", "send-1b") },
    });
    registerMockObject("send-1a");
    const secondB = registerMockObject("send-1b");

    updateDevice({ id: "chain-0,chain-1", sendGainDb: -12, sendReturn: "a,b" });

    expect(send.set).toHaveBeenCalledWith("display_value", -12);
    expect(secondB.set).toHaveBeenCalledWith("display_value", -12);
  });

  it("sets a chain's send to a rack return chain", () => {
    updateDevice({ id: "chain-0", sendGainDb: -12, sendReturn: "a" });

    expect(send.set).toHaveBeenCalledWith("display_value", -12);
    expect(volume.set).not.toHaveBeenCalled();
  });

  it("does not touch the mixer when nothing mixer-related is given", () => {
    updateDevice({ id: "chain-0", mute: true });

    expect(volume.set).not.toHaveBeenCalled();
    expect(panning.set).not.toHaveBeenCalled();
    expect(send.set).not.toHaveBeenCalled();
  });

  // pan and sendReturn each need their own case: paired with another mixer
  // param they ride along on the other one's gate check.
  it("sets pan when it is the only mixer param given", () => {
    updateDevice({ id: "chain-0", pan: 0.5 });

    expect(panning.set).toHaveBeenCalledWith("value", 0.5);
  });

  it("refuses the call when sendReturn is the only mixer param given", () => {
    expect(() => updateDevice({ id: "chain-0", sendReturn: "a" })).toThrow(
      "sendGainDb and sendReturn must both be specified",
    );
    expect(send.set).not.toHaveBeenCalled();
  });

  // Same gate: `sends` alone has to open it. It shipped not doing so, and
  // every unit test passed because they all called applyChainMixer directly.
  it("sets sends when it is the only mixer param given", () => {
    updateDevice({
      id: "chain-0",
      sends: [{ return: "a", gainDb: -12 }],
    });

    expect(send.set).toHaveBeenCalledWith("display_value", -12);
  });

  // A chain's mixer params have no entry of their own on a device — `params`
  // reports per param, these don't go through it — so they ride on the
  // target's entry, and a target they were the whole of throws (ADR-0042).
  it("refuses the chain mixer params sent to a device", () => {
    registerMockObject("target-1", { type: "SimplerDevice" });

    expect(() =>
      updateDevice({
        id: "target-1",
        gainDb: -3,
        pan: 1,
        sendGainDb: -6,
        sendReturn: "a",
        sends: [{ return: "a", gainDb: -6 }],
      }),
    ).toThrow(
      "gainDb, pan, sendGainDb, sendReturn, sends not applicable to a device",
    );
    expect(capturedWarnings()).toStrictEqual([]);
  });

  // Two things to say about one target: the level Live didn't keep, and the
  // param a chain has no use for. Both ride on the same entry.
  it("adds a not-applicable param to a reason the entry already has", () => {
    keepsParamValue(volume, -15.02);

    expect(
      updateDevice({ id: "chain-0", gainDb: -15, macroCount: 4 }),
    ).toStrictEqual({
      id: "chain-0",
      path: "t0/d0/c0",
      gainDb: -15.02,
      detail:
        "gainDb read back as shown, not as sent; macroCount not applicable to a drum pad chain",
    });
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("keeps the device's slot in a call that also names a chain", () => {
    registerMockObject("target-1", { type: "SimplerDevice" });

    const result = updateDevice({ id: "target-1,chain-0", gainDb: -3 }) as [
      unknown,
      { id: string },
    ];

    expect(result[0]).toStrictEqual({
      id: "target-1",
      ok: false,
      detail: "gainDb not applicable to a device",
    });
    expect(result[1].id).toBe("chain-0");
    expect(capturedWarnings()).toStrictEqual([]);
  });
});

describe("updateDevice - return chain rename mid-request", () => {
  it("sends by a return chain's new name after an earlier id in the same call renamed it", () => {
    const rackPath = livePath.track(0).device(0);
    const chainAPath = rackPath.chain(0);
    const chainBPath = rackPath.chain(1);
    const returnXPath = rackPath.returnChain(0);

    registerMockObject("rack", {
      path: rackPath,
      properties: { return_chains: children("return-x") },
    });

    const returnX = registerMockObject("return-x", {
      path: returnXPath,
      type: "Chain",
      properties: { name: "Delay" },
    });

    // Real Live reflects a name write immediately; the mock's set() is a
    // pure spy by default, so mirror that here.
    returnX.set.mockImplementation((prop: string, value: unknown) => {
      if (prop === "name") {
        returnX.properties.name = value;
      }
    });

    registerMockObject("chain-a", { path: chainAPath, type: "Chain" });
    registerMockObject("mixer-a", {
      path: `${chainAPath} mixer_device`,
      properties: { sends: children("send-a") },
    });
    registerMockObject("send-a");

    registerMockObject("chain-b", { path: chainBPath, type: "Chain" });
    registerMockObject("mixer-b", {
      path: `${chainBPath} mixer_device`,
      properties: { sends: children("send-b") },
    });
    const sendB = registerMockObject("send-b");

    // One request, matching how the adapter wraps a real tool call: the
    // return-chain memo lives for its whole duration.
    beginLiveApiScope();

    let result: SendEntries;

    try {
      result = updateDevice({
        id: "chain-a,return-x,chain-b",
        name: "Chain A,Echo,Chain B",
        sends: [{ return: "Echo", gainDb: -6 }],
      }) as SendEntries;
    } finally {
      endLiveApiScope();
    }

    expect(returnX.set).toHaveBeenCalledWith("name", "Echo");
    // chain-a's send to "Echo" legitimately misses — at that point in the
    // request Live still calls the return chain "Delay" — and says so on its
    // own entry. chain-b's must land, and say nothing.
    expect(sendB.set).toHaveBeenCalledWith("display_value", -6);
    expect(result[0]?.sends).toStrictEqual([
      {
        return: "Echo",
        ok: false,
        detail: 'no return chain matching "Echo" (returns: Delay)',
      },
    ]);
    expect(result[2]?.sends).toBeUndefined();
    // The rename target has no send of its own in this mock, which is the one
    // chain-mixer path that still warns rather than reporting on the entry.
    expect(
      capturedWarnings().filter((w) => w.includes("no return chain matching")),
    ).toStrictEqual([]);
  });
});

describe("updateDevice - rack moved mid-request", () => {
  it("sends against the rack now at a path, not the one that moved away", () => {
    const rackPath = livePath.track(0).device(0);
    const chainPath = rackPath.chain(0);

    registerMockObject("chain", { path: chainPath, type: "Chain" });
    registerMockObject("mixer", {
      path: `${chainPath} mixer_device`,
      properties: { sends: children("send") },
    });
    const send = registerMockObject("send");

    registerMockObject("rc-a", {
      type: "Chain",
      properties: { name: "Delay" },
    });
    registerMockObject("rc-b", { type: "Chain", properties: { name: "Verb" } });
    const rack = registerMockObject("rack-a", {
      path: rackPath,
      properties: { return_chains: children("rc-a") },
    });

    beginLiveApiScope();

    let result: unknown;

    try {
      updateDevice({ id: "chain", sends: [{ return: "Delay", gainDb: -12 }] });

      // Rack A moves away and rack B slides into its path. Mutated in place:
      // registering B would clear the memo this test is about.
      rack.id = "rack-b";
      rack.properties.return_chains = children("rc-b");

      result = updateDevice({
        id: "chain",
        sends: [{ return: "Verb", gainDb: -6 }],
      });
    } finally {
      endLiveApiScope();
    }

    expect(send.set).toHaveBeenLastCalledWith("display_value", -6);
    expect(result).toStrictEqual({ id: "chain", path: "t0/d0/c0" });
  });
});

/** The entries a multi-target update-device answers with, as far as sends go. */
type SendEntries = Array<{ sends?: unknown[] }>;
