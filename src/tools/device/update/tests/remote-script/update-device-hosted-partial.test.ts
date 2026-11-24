// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A wrapper write that throws on one param still answers for each: the params
// written around it are reported as written.

import { beforeEach, describe, expect, it } from "vitest";
import { clearMockRegistry } from "#src/test/mocks/mock-registry.ts";
import {
  infoReply,
  installWrapper,
  registerWrapperDevice,
} from "#src/tools/device/tests/helpers/plugin-host-wrapper-fixtures.ts";
import { livePath, updateDevice } from "../update-device-test-helpers.ts";

const HIT = { id: "device-123", path: "t0/d0" };
const PARAMS = [
  { name: "Mix", value: "75" },
  { name: "Size", value: "40" },
  { name: "Decay", value: "2" },
];

const landed = (index: number, name: string, display: string) => ({
  ok: true,
  index,
  name,
  value: 0.5,
  display,
});

/**
 * Write PARAMS with a wrapper whose 2nd param fails with this kind.
 * @param kind - The kind the wrapper gives the 2nd param
 * @returns What the call answered
 */
async function writeFailingSecond(kind: string): Promise<unknown> {
  installWrapper({
    info: () => infoReply("Serum 2"),
    write: () => ({
      success: true,
      params: [
        landed(1, "Mix", "75.00"),
        { ok: false, kind, error: "vst~ gone" },
        landed(3, "Decay", "2.00"),
      ],
    }),
  });

  return await Promise.resolve().then(() =>
    updateDevice({ id: "device-123", params: PARAMS }),
  );
}

describe("updateDevice hosted plug-in params, a throw on one param", () => {
  beforeEach(() => {
    clearMockRegistry();
    registerWrapperDevice({ path: String(livePath.track(0).device(0)) });
  });

  it("reports the params written around a param that failed before it moved", async () => {
    expect(await writeFailingSecond("failed")).toStrictEqual({
      ...HIT,
      params: [
        { id: "h1", name: "Mix" },
        { name: "Size", ok: false, detail: "not set: vst~ gone" },
        { id: "h3", name: "Decay" },
      ],
    });
  });

  it("says a param may have changed when the wrapper threw after moving it", async () => {
    expect(await writeFailingSecond("changed")).toStrictEqual({
      ...HIT,
      params: [
        { id: "h1", name: "Mix" },
        {
          name: "Size",
          ok: false,
          detail: "may have changed: vst~ gone; read the device to check",
        },
        { id: "h3", name: "Decay" },
      ],
    });
  });
});
