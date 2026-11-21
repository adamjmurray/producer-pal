// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A bare number on a hosted param is in the unit the plug-in shows, so the
// wrapper is told which numbers had no unit, and a read-back that it scaled
// is compared in that unit.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearMockRegistry } from "#src/test/mocks/mock-registry.ts";
import {
  type WrapperMessage,
  infoReply,
  installWrapper,
  registerWrapperDevice,
} from "#src/tools/device/tests/helpers/plugin-host-wrapper-fixtures.ts";
import { livePath, updateDevice } from "../update-device-test-helpers.ts";

const PATH = String(livePath.track(0).device(0));
const HIT = { id: "device-123", path: "t0/d0" };

/**
 * Answer `write` with one result, and hand back the entries it was sent.
 * @param result - What the wrapper answers for the one entry
 * @returns The entries the wrapper heard
 */
function wrapperAnswers(result: WrapperMessage): WrapperMessage[] {
  return installWrapper({
    info: () => infoReply("Pro-Q 4"),
    write: () => ({ success: true, params: [result] }),
  });
}

/**
 * @param value - The value written to "Freq"
 * @returns What the call answered
 */
async function setFreq(value: string): Promise<unknown> {
  return await Promise.resolve().then(() =>
    updateDevice({ id: "device-123", params: [{ name: "Freq", value }] }),
  );
}

/**
 * @param value - The value written to "Freq"
 * @param result - What the wrapper answers for it
 * @returns The one entry the wrapper was sent
 */
async function sentFor(
  value: string,
  result: WrapperMessage,
): Promise<WrapperMessage> {
  const heard = wrapperAnswers(result);

  await setFreq(value);

  const write = heard.find((request) => request.op === "write");
  const [entry] = (write?.params ?? []) as WrapperMessage[];

  return entry as WrapperMessage;
}

describe("updateDevice hosted plug-in params in the displayed unit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
    registerWrapperDevice({ path: PATH });
  });

  const ok = { ok: true, index: 3, name: "Freq", value: 0.5 };

  it.each([
    ["3", { name: "Freq", text: "3", number: 3, bare: true }],
    ["0.8", { name: "Freq", text: "0.8", number: 0.8, bare: true }],
    ["-6", { name: "Freq", text: "-6", number: -6, bare: true }],
  ])("flags the bare number %s", async (value, expected) => {
    expect(await sentFor(value, ok)).toStrictEqual(expected);
  });

  it.each([
    ["3 kHz", { name: "Freq", text: "3 kHz", number: 3000 }],
    ["3000 Hz", { name: "Freq", text: "3000 Hz", number: 3000 }],
    ["0.8 s", { name: "Freq", text: "0.8 s", number: 800 }],
    ["800 ms", { name: "Freq", text: "800 ms", number: 800 }],
    ["-6 dB", { name: "Freq", text: "-6 dB", number: -6 }],
    ["0.8k", { name: "Freq", text: "0.8k", number: 800 }],
  ])("sends %s as written, with no flag", async (value, expected) => {
    expect(await sentFor(value, ok)).toStrictEqual(expected);
  });

  it("sends text that isn't a number without a number", async () => {
    expect(await sentFor("1/16", ok)).toStrictEqual({
      name: "Freq",
      text: "1/16",
    });
  });

  it("reports only identity when a bare kHz number landed on it", async () => {
    wrapperAnswers({ ...ok, display: "3.00 kHz", scale: 1000 });

    expect(await setFreq("3")).toStrictEqual({
      ...HIT,
      params: [{ id: "h3", name: "Freq" }],
    });
  });

  it("reports only identity when a bare s number landed on it", async () => {
    wrapperAnswers({ ...ok, display: "0.80 s", scale: 1000 });

    expect(await setFreq("0.8")).toStrictEqual({
      ...HIT,
      params: [{ id: "h3", name: "Freq" }],
    });
  });

  it("still says so when a scaled bare number landed elsewhere", async () => {
    wrapperAnswers({ ...ok, display: "20.0 kHz", scale: 1000 });

    expect(await setFreq("30")).toStrictEqual({
      ...HIT,
      params: [
        {
          id: "h3",
          name: "Freq",
          value: "20.0 kHz",
          detail: "value read back as shown, not as sent",
        },
      ],
    });
  });

  it("compares a plain bare number as it did before", async () => {
    wrapperAnswers({ ...ok, display: "-6.00 dB" });

    expect(await setFreq("-6")).toStrictEqual({
      ...HIT,
      params: [{ id: "h3", name: "Freq" }],
    });
  });
});
