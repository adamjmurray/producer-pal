// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import "#src/live-api-adapter/live-api-extensions.ts";
import { readSendBack, readSendGainDb, refusedSend } from "./send-list.ts";

/**
 * Register a send DeviceParameter and return a fresh LiveAPI pointed at it.
 * @param displayValue - The `display_value` Live answers with
 * @returns The send object
 */
function sendWithDisplayValue(displayValue: number | string): LiveAPI {
  registerMockObject("send-1", {
    properties: { display_value: displayValue },
  });

  return LiveAPI.from("id send-1");
}

describe("readSendBack", () => {
  it("publishes a level Max serialized as a string the way a read does", () => {
    // Max can serialize a tiny float32 as an exponent-notation string, which
    // is the number it spells: the level asked for, so nothing to say about it.
    const send = sendWithDisplayValue("9.999999747378752e-05");

    expect(readSendBack(send, "Reverb", "return-1", 0.0001)).toStrictEqual({
      return: "Reverb",
      returnId: "return-1",
      gainDb: 0,
    });
  });

  it("stands the written level in when nothing reads back", () => {
    // An omission would read as "no write", so the level written stands in.
    registerMockObject("send-1", { properties: {} });

    expect(
      readSendBack(LiveAPI.from("id send-1"), "Reverb", undefined, -6),
    ).toStrictEqual({ return: "Reverb", gainDb: -6 });
  });

  it("rounds a numeric display_value", () => {
    const send = sendWithDisplayValue(-6.333000183105469);

    expect(readSendBack(send, "Reverb", "return-1", -6.333333)).toStrictEqual({
      return: "Reverb",
      returnId: "return-1",
      gainDb: -6.33,
    });
  });

  it("says why the level isn't the one written when Live kept another", () => {
    const send = sendWithDisplayValue(-70);

    expect(readSendBack(send, "Reverb", "return-1", -90)).toStrictEqual({
      return: "Reverb",
      returnId: "return-1",
      gainDb: -70,
      detail: "gainDb read back as shown, not as sent",
    });
  });
});

describe("refusedSend", () => {
  it("reports the return and why nothing was written, with no level", () => {
    expect(
      refusedSend("Reverb", "return-1", "gainDb is disabled"),
    ).toStrictEqual({
      return: "Reverb",
      returnId: "return-1",
      ok: false,
      detail: "gainDb is disabled",
    });
  });

  it("names the return alone when no return chain lines up with the send", () => {
    expect(
      refusedSend("Reverb", undefined, "gainDb is disabled"),
    ).toStrictEqual({
      return: "Reverb",
      ok: false,
      detail: "gainDb is disabled",
    });
  });
});

describe("readSendGainDb", () => {
  it("rounds a value Max serialized as an exponent-notation string", () => {
    // A pure read has no written value to fall back on, so it must round what
    // Live answers with instead of reporting the raw text.
    const send = sendWithDisplayValue("9.999999747378752e-05");

    expect(readSendGainDb(send, "Reverb", "return-1")).toStrictEqual({
      return: "Reverb",
      returnId: "return-1",
      gainDb: 0,
    });
  });

  it("rounds a numeric display_value", () => {
    const send = sendWithDisplayValue(-6.333000183105469);

    expect(readSendGainDb(send, "Reverb")).toStrictEqual({
      return: "Reverb",
      gainDb: -6.33,
    });
  });
});
