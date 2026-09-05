// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  keepsParamValue,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { updateTrack } from "../update-track.ts";
import "#src/live-api-adapter/live-api-extensions.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

describe("updateTrack - send properties", () => {
  let track123: RegisteredMockObject;
  let send1: RegisteredMockObject;
  let send2: RegisteredMockObject;
  let send3: RegisteredMockObject;

  beforeEach(() => {
    track123 = registerMockObject("123", { path: livePath.track(0) });
    registerMockObject("456", { path: livePath.track(1) });

    registerMockObject("mixer_1", {
      path: livePath.track(0).mixerDevice(),
      properties: { sends: children("send_1", "send_2") },
    });
    registerMockObject("mixer_2", {
      path: livePath.track(1).mixerDevice(),
      properties: { sends: children("send_3", "send_4") },
    });

    registerMockObject("liveSet", {
      path: livePath.liveSet,
      properties: { return_tracks: children("return_A", "return_B") },
    });
    registerMockObject("return_A", {
      path: livePath.returnTrack(0),
      properties: { name: "A-Reverb" },
    });
    registerMockObject("return_B", {
      path: livePath.returnTrack(1),
      properties: { name: "B-Delay" },
    });

    send1 = registerMockObject("send_1", {});
    send2 = registerMockObject("send_2", {});
    send3 = registerMockObject("send_3", {});
    registerMockObject("send_4", {});
  });

  it("should set send gain with exact return name", () => {
    updateTrack({
      id: "123",
      sendGainDb: -12,
      sendReturn: "A-Reverb",
    });

    expect(send1.set).toHaveBeenCalledWith("display_value", -12);
  });

  it("should set send gain with letter prefix", () => {
    updateTrack({
      id: "123",
      sendGainDb: -6,
      sendReturn: "A",
    });

    expect(send1.set).toHaveBeenCalledWith("display_value", -6);
  });

  it("should set second send with letter prefix", () => {
    updateTrack({
      id: "123",
      sendGainDb: -3,
      sendReturn: "B",
    });

    expect(send2.set).toHaveBeenCalledWith("display_value", -3);
  });

  it("should match a return track letter in lower case", () => {
    updateTrack({
      id: "123",
      sendGainDb: -6,
      sendReturn: "a",
    });

    expect(send1.set).toHaveBeenCalledWith("display_value", -6);
  });

  it("should set send gain to minimum value", () => {
    updateTrack({
      id: "123",
      sendGainDb: -70,
      sendReturn: "A",
    });

    expect(send1.set).toHaveBeenCalledWith("display_value", -70);
  });

  it("should set send gain to maximum value (0 dB)", () => {
    updateTrack({
      id: "123",
      sendGainDb: 0,
      sendReturn: "A",
    });

    expect(send1.set).toHaveBeenCalledWith("display_value", 0);
  });

  it("should match a return track by id", () => {
    // Two returns named the same thing: no name or letter tells them apart, so
    // this is the case only an id can address.
    registerMockObject("return_A", {
      path: livePath.returnTrack(0),
      properties: { name: "Verb" },
    });
    registerMockObject("return_B", {
      path: livePath.returnTrack(1),
      properties: { name: "Verb" },
    });

    updateTrack({
      id: "123",
      sendGainDb: -6,
      sendReturn: "return_B",
    });

    expect(send1.set).not.toHaveBeenCalled();
    expect(send2.set).toHaveBeenCalledWith("display_value", -6);
  });

  it("should warn and skip for an id that is not a return track", () => {
    const result = updateTrack({
      id: "123",
      sendGainDb: -12,
      sendReturn: "123",
    });

    expectSendUpdateSkipped(
      result,
      [send1, send2],
      'sendReturn "123" names no return track',
    );
  });

  // Half a pair names no send, and it names the same non-send for every track
  // in the list. Refused before any of them is touched.
  it.each([
    ["sendGainDb", { sendGainDb: -12 }],
    ["sendReturn", { sendReturn: "A" }],
  ])("refuses the call when only %s is provided", (_label, args) => {
    expect(() => updateTrack({ id: "123", ...args })).toThrow(
      "sendGainDb and sendReturn must both be specified",
    );
    expect(send1.set).not.toHaveBeenCalled();
    expect(send2.set).not.toHaveBeenCalled();
  });

  it("should warn and skip when return track not found", () => {
    // Should not throw, just warn and skip the send update. Crucially, no send
    // is touched — a mis-initialized "not found" sentinel would silently write
    // the wrong send instead of skipping.
    const result = updateTrack({
      id: "123",
      sendGainDb: -12,
      sendReturn: "C",
    });

    expectSendUpdateSkipped(
      result,
      [send1, send2],
      'sendReturn "C" names no return track',
    );
  });

  it("should not over-match a return whose name merely starts with the letter", () => {
    // "A" matches "A-Reverb" (letter-dash prefix) or an exact name — it must NOT
    // match any name that happens to start with "A" (e.g. "Analog"). Guards the
    // `+ "-"` in the prefix check.
    registerMockObject("return_A", {
      path: livePath.returnTrack(0),
      properties: { name: "Analog" },
    });

    const result = updateTrack({
      id: "123",
      sendGainDb: -9,
      sendReturn: "A",
    });

    expectSendUpdateSkipped(
      result,
      [send1, send2],
      'sendReturn "A" names no return track',
    );
  });

  it("should warn and skip when track has no sends", () => {
    // Override mixer_1 with empty sends for this test
    registerMockObject("mixer_1", {
      path: livePath.track(0).mixerDevice(),
      properties: { sends: [] },
    });

    // Should not throw, just warn and skip the send update
    const result = updateTrack({
      id: "123",
      sendGainDb: -12,
      sendReturn: "A",
    });

    expectSendUpdateSkipped(result, [send1, send2], "has no sends");
  });

  it("names the param and lists the returns when none matches", () => {
    // The model has to be able to tell which param went wrong and what it
    // could have said instead.
    updateTrack({ id: "123", sendGainDb: -12, sendReturn: "ZZZ" });

    expect(capturedWarnings()).toContain(
      'sendReturn "ZZZ" names no return track, so sendGainDb was ' +
        "not written (Available: A-Reverb, B-Delay)",
    );
  });

  it("says so when the Live Set has no return tracks at all", () => {
    // Listing nothing reads as a bug; the returns can only be added in Live.
    registerMockObject("liveSet", {
      path: livePath.liveSet,
      properties: { return_tracks: [] },
    });

    updateTrack({ id: "123", sendGainDb: -12, sendReturn: "A" });

    expect(capturedWarnings()).toContain(
      'sendReturn "A" names no return track, so sendGainDb was ' +
        "not written (the Live Set has no return tracks)",
    );
  });

  it("warns once for a multi-track call, not once per track", () => {
    // The return tracks belong to the Live Set, so nothing about a track
    // decides this — checking it per track repeats one warning down the list.
    updateTrack({ id: "123,456", sendGainDb: -12, sendReturn: "ZZZ" });

    expect(
      capturedWarnings().filter((warning) => warning.includes("ZZZ")),
    ).toHaveLength(1);
  });

  it("should set sends on multiple tracks", () => {
    updateTrack({
      id: "123,456",
      sendGainDb: -6,
      sendReturn: "A",
    });

    expect(send1.set).toHaveBeenCalledWith("display_value", -6);
    expect(send3.set).toHaveBeenCalledWith("display_value", -6);
  });

  describe("sends list", () => {
    it("sets several sends in one call", () => {
      updateTrack({
        id: "123",
        sends: [
          { return: "A", gainDb: -6 },
          { return: "B-Delay", gainDb: -12 },
        ],
      });

      expect(send1.set).toHaveBeenCalledWith("display_value", -6);
      expect(send2.set).toHaveBeenCalledWith("display_value", -12);
    });

    it("sets the same sends on every track in the list", () => {
      updateTrack({ id: "123,456", sends: [{ return: "A", gainDb: -6 }] });

      expect(send1.set).toHaveBeenCalledWith("display_value", -6);
      expect(send3.set).toHaveBeenCalledWith("display_value", -6);
    });

    it("skips the entry whose return matches nothing and keeps the rest", () => {
      keepsParamValue(send2, -11.98);

      const result = updateTrack({
        id: "123",
        sends: [
          { return: "ZZZ", gainDb: -6 },
          { return: "B", gainDb: -12 },
        ],
      });

      expect(capturedWarnings()).toContain(
        'sends entry "ZZZ" names no return track, so its gainDb ' +
          "was not written (Available: A-Reverb, B-Delay)",
      );
      expect(send1.set).not.toHaveBeenCalled();
      expect(send2.set).toHaveBeenCalledWith("display_value", -12);
      // Only the send that landed is reported, so the entry that went nowhere
      // can't be read back as though it had.
      expect(result).toStrictEqual({
        id: "123",
        path: "t0",
        sends: [{ return: "B-Delay", returnId: "return_B", gainDb: -11.98 }],
      });
    });

    it("honors the scalar pair alongside a list naming another return", () => {
      updateTrack({
        id: "123",
        sendGainDb: -6,
        sendReturn: "A",
        sends: [{ return: "B", gainDb: -12 }],
      });

      expect(send1.set).toHaveBeenCalledWith("display_value", -6);
      expect(send2.set).toHaveBeenCalledWith("display_value", -12);
    });

    it("lets the list override the scalar pair on the same return", () => {
      // A send holds one value, so the caller has to be told which one held.
      updateTrack({
        id: "123",
        sendGainDb: -6,
        sendReturn: "A",
        sends: [{ return: "A-Reverb", gainDb: -12 }],
      });

      expect(capturedWarnings()).toContain(
        'sends overrides sendGainDb/sendReturn: "A-Reverb" ended up at -12 dB',
      );
      expect(send1.set).toHaveBeenCalledWith("display_value", -12);
      expect(send1.set).not.toHaveBeenCalledWith("display_value", -6);
    });

    it("keeps the last entry when two name the same return", () => {
      // Live clamped both requests, so a warning quoting either is caught.
      keepsParamValue(send1, -70);

      updateTrack({
        id: "123",
        sends: [
          { return: "A", gainDb: -6 },
          { return: "A-Reverb", gainDb: -12 },
        ],
      });

      // "ended up at" is a claim about the final state, so it names the level
      // read back — not the one that won the argument list.
      expect(capturedWarnings()).toContain(
        'sends names one return more than once: "A-Reverb" ended up at -70 dB',
      );
      expect(send1.set).toHaveBeenCalledTimes(1);
      expect(send1.set).toHaveBeenCalledWith("display_value", -12);
    });

    it("announces a collision once for a multi-track call", () => {
      // The returns belong to the Live Set, so the clash is a fact about the
      // call — repeating it down the track list says nothing new.
      updateTrack({
        id: "123,456",
        sends: [
          { return: "A", gainDb: -6 },
          { return: "A-Reverb", gainDb: -12 },
        ],
      });

      expect(
        capturedWarnings().filter((warning) =>
          warning.includes("names one return more than once"),
        ),
      ).toHaveLength(1);
    });

    it("says nothing about a collision on a send that never landed", () => {
      // A rack macro owns the first send, so Live ignored that write. There is
      // no level it ended up at, and the refusal warned for itself.
      registerMockObject("send_1", { properties: { is_enabled: 0 } });

      updateTrack({
        id: "123",
        sends: [
          { return: "A", gainDb: -6 },
          { return: "A-Reverb", gainDb: -12 },
          { return: "B", gainDb: -9 },
        ],
      });

      const warnings = capturedWarnings().join();

      expect(warnings).toContain("is disabled and was not changed");
      expect(warnings).not.toContain("names one return more than once");
    });
  });

  // The write used to land with the result saying nothing about it, so a
  // clamped or snapped level was invisible to the model that asked for it.
  describe("result", () => {
    it("reports every send it wrote, keyed by the return that resolved", () => {
      keepsParamValue(send1, -11.98);

      const result = updateTrack({
        id: "123",
        sends: [{ return: "A", gainDb: -12 }],
      });

      expect(result).toStrictEqual({
        id: "123",
        path: "t0",
        sends: [{ return: "A-Reverb", returnId: "return_A", gainDb: -11.98 }],
      });
    });

    it("reports the sendGainDb/sendReturn pair under sends as well", () => {
      keepsParamValue(send1, -6.02);

      const result = updateTrack({
        id: "123",
        sendGainDb: -6,
        sendReturn: "A",
      });

      // One send has one shape, whichever param spelled it.
      expect(result).toStrictEqual({
        id: "123",
        path: "t0",
        sends: [{ return: "A-Reverb", returnId: "return_A", gainDb: -6.02 }],
      });
    });

    it("reports the level Live kept, not the one asked for", () => {
      keepsParamValue(send1, -70);

      const result = updateTrack({
        id: "123",
        sends: [{ return: "A", gainDb: -100 }],
      });

      expect(result).toStrictEqual({
        id: "123",
        path: "t0",
        sends: [{ return: "A-Reverb", returnId: "return_A", gainDb: -70 }],
      });
    });

    it("rounds the raw float32 to Live's display resolution", () => {
      // Live snapped the request to a nearby step and handed back its raw
      // float32, so the rounded read-back is not the rounded argument.
      keepsParamValue(send1, -6.333000183105469);

      const result = updateTrack({
        id: "123",
        sends: [{ return: "A", gainDb: -6.5 }],
      });

      expect(result).toStrictEqual({
        id: "123",
        path: "t0",
        sends: [{ return: "A-Reverb", returnId: "return_A", gainDb: -6.33 }],
      });
    });

    // Max serializes an exponent-notation float as a string. The level landed,
    // so reporting nothing for it would read as "no write".
    it("falls back to the written level when Live answers with a string", () => {
      keepsParamValue(send1, "-1.000000013351432e-01");

      const result = updateTrack({
        id: "123",
        sends: [{ return: "A", gainDb: -0.1 }],
      });

      expect(result).toStrictEqual({
        id: "123",
        path: "t0",
        sends: [{ return: "A-Reverb", returnId: "return_A", gainDb: -0.1 }],
      });
    });
  });

  it("should combine send update with other properties", () => {
    updateTrack({
      id: "123",
      name: "Test Track",
      sendGainDb: -12,
      sendReturn: "B",
    });

    expect(track123.set).toHaveBeenCalledWith("name", "Test Track");
    expect(send2.set).toHaveBeenCalledWith("display_value", -12);
  });

  it("does not read the return tracks when no send was asked for", () => {
    const liveSet = registerMockObject("liveSet", {
      path: livePath.liveSet,
      properties: { return_tracks: children("return_A", "return_B") },
    });

    updateTrack({ id: "123", name: "Test Track" });

    expect(liveSet.get).not.toHaveBeenCalledWith("return_tracks");
  });

  it("should not set send when neither param is provided", () => {
    updateTrack({
      id: "123",
      name: "Test Track",
    });

    // Should only set name, not any send values
    expect(send1.set).not.toHaveBeenCalled();
    expect(send2.set).not.toHaveBeenCalled();
  });

  it("should warn and skip when mixer device does not exist", () => {
    // Override mixer to be non-existent for this test
    registerMockObject("id 0", {
      path: livePath.track(0).mixerDevice(),
    });

    // Should not throw, just warn and skip the send update
    const result = updateTrack({
      id: "123",
      sendGainDb: -12,
      sendReturn: "A",
    });

    expectSendUpdateSkipped(result, [send1, send2], "has no mixer device");
  });

  it("should warn and skip when send index exceeds available sends", () => {
    // Setup: 3 return tracks but only 2 sends
    registerMockObject("liveSet", {
      path: livePath.liveSet,
      properties: {
        return_tracks: children("return_A", "return_B", "return_C"),
      },
    });
    registerMockObject("return_C", {
      path: livePath.returnTrack(2),
      properties: { name: "C-Echo" },
    });

    // Should not throw, just warn and skip the send update
    const result = updateTrack({
      id: "123",
      sendGainDb: -12,
      sendReturn: "C", // Matches return track at index 2
    });

    expectSendUpdateSkipped(result, [send1, send2], "has no send for return");
  });
});

// Asserts that updateTrack declined to apply a send update: none of the given
// sends were written, the warning reached the model on the response, and the
// track itself still reported a plain success result (warn-and-skip must never
// throw, so partial successes can continue across tracks).
function expectSendUpdateSkipped(
  result: ReturnType<typeof updateTrack>,
  sends: RegisteredMockObject[],
  expectedWarning: string,
): void {
  for (const send of sends) {
    expect(send.set).not.toHaveBeenCalled();
  }

  expect(capturedWarnings()).toContainEqual(
    expect.stringContaining(expectedWarning),
  );
  expect(result).toStrictEqual({ id: "123", path: "t0" });
}
