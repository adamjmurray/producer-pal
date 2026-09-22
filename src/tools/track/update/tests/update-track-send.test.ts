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

const SNAPPED_SEND = "gainDb read back as shown, not as sent";

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

  it("reports an id that is not a return track on the entry", () => {
    const result = updateTrack({
      id: "123",
      sendGainDb: -12,
      sendReturn: "123",
    });

    expectSendUnresolved(result, [send1, send2], "123");
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

  it("should skip when return track not found", () => {
    // Should not throw, just report and skip the send update. Crucially, no
    // send is touched — a mis-initialized "not found" sentinel would silently
    // write the wrong send instead of skipping.
    const result = updateTrack({
      id: "123",
      sendGainDb: -12,
      sendReturn: "C",
    });

    expectSendUnresolved(result, [send1, send2], "C");
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

    expectSendUnresolved(result, [send1, send2], "A");
  });

  it("says on the track's entry that it has no sends", () => {
    // Override mixer_1 with empty sends for this test
    registerMockObject("mixer_1", {
      path: livePath.track(0).mixerDevice(),
      properties: { sends: [] },
    });

    const result = updateTrack({
      id: "123",
      sendGainDb: -12,
      sendReturn: "A",
    });

    expectSendRefused(result, [send1, send2], "the track has no sends");
  });

  it("lists the returns it could have named instead", () => {
    // The model has to be able to tell what it could have said instead.
    const result = updateTrack({
      id: "123",
      sendGainDb: -12,
      sendReturn: "ZZZ",
    });

    expect(sendsOf(result)).toStrictEqual([
      {
        return: "ZZZ",
        ok: false,
        reason: 'no return track matching "ZZZ" (Available: A-Reverb, B-Delay)',
      },
    ]);
  });

  it("says so when the Live Set has no return tracks at all", () => {
    // Listing nothing reads as a bug; the returns can only be added in Live.
    registerMockObject("liveSet", {
      path: livePath.liveSet,
      properties: { return_tracks: [] },
    });

    const result = updateTrack({
      id: "123",
      sendGainDb: -12,
      sendReturn: "A",
    });

    expect(sendsOf(result)).toStrictEqual([
      {
        return: "A",
        ok: false,
        reason:
          'no return track matching "A" (the Live Set has no return tracks)',
      },
    ]);
  });

  it("puts the entry on every track the call named", () => {
    // The return tracks belong to the Live Set, so this is resolved once — but
    // no track named by the call is left without an answer.
    const result = updateTrack({
      id: "123,456",
      sendGainDb: -12,
      sendReturn: "ZZZ",
    });

    expect(capturedWarnings()).toStrictEqual([]);
    expect(result).toStrictEqual(
      [0, 1].map((index) => ({
        id: index === 0 ? "123" : "456",
        path: `t${index}`,
        sends: [
          {
            return: "ZZZ",
            ok: false,
            reason:
              'no return track matching "ZZZ" (Available: A-Reverb, B-Delay)',
          },
        ],
      })),
    );
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
    it("matches and reports an all-digit return track name as a string", () => {
      // The match, and the reported `return`, must both see a string.
      registerMockObject("return_A", {
        path: livePath.returnTrack(0),
        properties: { name: 5678 },
      });
      keepsParamValue(send1, -6);

      const result = updateTrack({
        id: "123",
        sends: [{ return: "5678", gainDb: -6 }],
      });

      expect(send1.set).toHaveBeenCalledWith("display_value", -6);
      // The level landed, so the send has nothing to say and drops out.
      expect(result).toStrictEqual({ id: "123", path: "t0" });
    });

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

      expect(capturedWarnings()).toStrictEqual([]);
      expect(send1.set).not.toHaveBeenCalled();
      expect(send2.set).toHaveBeenCalledWith("display_value", -12);
      // The one that was written is reported because Live kept another level;
      // the entry that went nowhere has no level and says why instead.
      expect(result).toStrictEqual({
        id: "123",
        path: "t0",
        sends: [
          {
            return: "B-Delay",
            returnId: "return_B",
            gainDb: -11.98,
            reason: SNAPPED_SEND,
          },
          {
            return: "ZZZ",
            ok: false,
            reason:
              'no return track matching "ZZZ" (Available: A-Reverb, B-Delay)',
          },
        ],
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
      // no level it ended up at, and the send's own entry says why.
      registerMockObject("send_1", { properties: { is_enabled: 0 } });

      const result = updateTrack({
        id: "123",
        sends: [
          { return: "A", gainDb: -6 },
          { return: "A-Reverb", gainDb: -12 },
          { return: "B", gainDb: -9 },
        ],
      });

      expect(capturedWarnings().join()).not.toContain(
        "names one return more than once",
      );
      expect(sendsOf(result)).toContainEqual({
        return: "A-Reverb",
        returnId: "return_A",
        ok: false,
        reason: expect.stringContaining(
          "gainDb is disabled and was not changed",
        ),
      });
    });

    it("announces a collision that lands on a later track but not the first", () => {
      // A rack macro owns the colliding send on track 1 only, so the first
      // track has nothing to name and the second one does.
      registerMockObject("send_2", { properties: { is_enabled: 0 } });

      updateTrack({
        id: "123,456",
        sends: [
          { return: "A", gainDb: -6 },
          { return: "B", gainDb: -9 },
          { return: "B-Delay", gainDb: -12 },
        ],
      });

      expect(
        capturedWarnings().filter((warning) =>
          warning.includes("names one return more than once"),
        ),
      ).toStrictEqual([
        'sends names one return more than once: "B-Delay" ended up at -12 dB',
      ]);
    });
  });

  // A level Live kept is the caller's own number, so the result says nothing
  // about it. A level Live changed was invisible to the model that asked for it.
  describe("result", () => {
    it("says nothing about a send that took the level asked for", () => {
      keepsParamValue(send1, -12);

      const result = updateTrack({
        id: "123",
        sends: [{ return: "A", gainDb: -12 }],
      });

      expect(send1.set).toHaveBeenCalledWith("display_value", -12);
      expect(result).toStrictEqual({ id: "123", path: "t0" });
    });

    it("reports only the send whose level Live changed", () => {
      keepsParamValue(send1, -11.98);
      keepsParamValue(send2, -12);

      const result = updateTrack({
        id: "123",
        sends: [
          { return: "A", gainDb: -12 },
          { return: "B", gainDb: -12 },
        ],
      });

      expect(result).toStrictEqual({
        id: "123",
        path: "t0",
        sends: [
          {
            return: "A-Reverb",
            returnId: "return_A",
            gainDb: -11.98,
            reason: SNAPPED_SEND,
          },
        ],
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
        sends: [
          {
            return: "A-Reverb",
            returnId: "return_A",
            gainDb: -6.02,
            reason: SNAPPED_SEND,
          },
        ],
      });
    });

    it("reports a level that reads back as a label instead of a number", () => {
      keepsParamValue(send1, "-inf");

      expect(
        updateTrack({ id: "123", sends: [{ return: "A", gainDb: -70 }] }),
      ).toStrictEqual({
        id: "123",
        path: "t0",
        sends: [
          {
            return: "A-Reverb",
            returnId: "return_A",
            gainDb: "-inf",
            reason: SNAPPED_SEND,
          },
        ],
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
        sends: [
          {
            return: "A-Reverb",
            returnId: "return_A",
            gainDb: -70,
            reason: SNAPPED_SEND,
          },
        ],
      });
    });

    it("reports the rounded read-back when it isn't the level asked for", () => {
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
        sends: [
          {
            return: "A-Reverb",
            returnId: "return_A",
            gainDb: -6.33,
            reason: SNAPPED_SEND,
          },
        ],
      });
    });

    it("counts the raw float32 of the level asked for as landed", () => {
      keepsParamValue(send1, -6.333000183105469);

      const result = updateTrack({
        id: "123",
        sends: [{ return: "A", gainDb: -6.333333 }],
      });

      expect(result).toStrictEqual({ id: "123", path: "t0" });
    });

    // Max serializes an exponent-notation float as a string. Nothing came back
    // to read, so the level written stands in — and it is the one asked for.
    it("says nothing when Live answers with a string for the level", () => {
      keepsParamValue(send1, "-1.000000013351432e-01");

      const result = updateTrack({
        id: "123",
        sends: [{ return: "A", gainDb: -0.1 }],
      });

      expect(result).toStrictEqual({ id: "123", path: "t0" });
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

  it("says on the track's entry that it has no mixer", () => {
    // Override mixer to be non-existent for this test
    registerMockObject("id 0", {
      path: livePath.track(0).mixerDevice(),
    });

    const result = updateTrack({
      id: "123",
      sendGainDb: -12,
      sendReturn: "A",
    });

    expectSendRefused(result, [send1, send2], "the track has no mixer");
  });

  it("says on the track's entry that it has no send for the return", () => {
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

    const result = updateTrack({
      id: "123",
      sendGainDb: -12,
      sendReturn: "C", // Matches return track at index 2
    });

    expectSendRefused(
      result,
      [send1, send2],
      "the track has no send for this return",
    );
  });
});

/**
 * A send the track itself couldn't take: nothing was written, the track's own
 * entry says why, and nothing was warned about (ADR-0042).
 * @param result - What updateTrack returned
 * @param sends - The send params that must have stayed untouched
 * @param reason - What the send's entry says
 */
function expectSendRefused(
  result: ReturnType<typeof updateTrack>,
  sends: RegisteredMockObject[],
  reason: string,
): void {
  for (const send of sends) {
    expect(send.set).not.toHaveBeenCalled();
  }

  expect(capturedWarnings()).toStrictEqual([]);
  expect(sendsOf(result)).toStrictEqual([
    expect.objectContaining({ ok: false, reason }),
  ]);
}

/**
 * The `sends` a single-track result reports.
 * @param result - What updateTrack returned
 * @returns The sends array, or an empty one when it reported none
 */
function sendsOf(result: ReturnType<typeof updateTrack>): unknown[] {
  return (result as { sends?: unknown[] }).sends ?? [];
}

/**
 * A send that named no return track: nothing was written, the track keeps its
 * slot with the send's own entry, and nothing was warned about (ADR-0042).
 * @param result - What updateTrack returned
 * @param sends - The send params that must have stayed untouched
 * @param named - The return, spelled the way the call wrote it
 */
function expectSendUnresolved(
  result: ReturnType<typeof updateTrack>,
  sends: RegisteredMockObject[],
  named: string,
): void {
  for (const send of sends) {
    expect(send.set).not.toHaveBeenCalled();
  }

  expect(capturedWarnings()).toStrictEqual([]);
  expect(result).toStrictEqual({
    id: "123",
    path: "t0",
    sends: [
      {
        return: named,
        ok: false,
        reason: expect.stringContaining(`no return track matching "${named}"`),
      },
    ],
  });
}
