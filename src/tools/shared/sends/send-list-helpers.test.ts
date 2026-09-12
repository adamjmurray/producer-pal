// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import "#src/live-api-adapter/live-api-extensions.ts";
import { readSendBack, readSendGainDb } from "./send-list-helpers.ts";

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
  it("falls back to the written value when Live answers with a string", () => {
    // Max can serialize a tiny float32 as an exponent-notation string. A write
    // echo already knows what it wrote, so it reports that instead of the raw
    // text — never a rounded number synthesized from a string it can't trust.
    const send = sendWithDisplayValue("9.999999747378752e-05");

    expect(readSendBack(send, "Reverb", "return-1", 0.0001)).toStrictEqual({
      return: "Reverb",
      returnId: "return-1",
      gainDb: 0.0001,
    });
  });

  it("rounds a numeric display_value", () => {
    const send = sendWithDisplayValue(-6.333000183105469);

    expect(readSendBack(send, "Reverb", "return-1")).toStrictEqual({
      return: "Reverb",
      returnId: "return-1",
      gainDb: -6.33,
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
