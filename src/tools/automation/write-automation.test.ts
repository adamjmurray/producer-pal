// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect, vi } from "vitest";
import { handleWriteAutomation } from "./write-automation.ts";

function makeBridge(actualReadback) {
  return {
    resolveDevice: vi.fn(async () => ({
      parameters: [{ name: "Filter Freq", min: 20, max: 20000 }],
    })),
    writeClipEnvelope: vi.fn(async () => {}),
    readClipEnvelope: vi.fn(async () => actualReadback),
  };
}

describe("handleWriteAutomation", () => {
  it("validiert, loest auf, schreibt, read-verifiziert (verified:true)", async () => {
    const bp = [
      { time: 0, value: 200 },
      { time: 4, value: 8000 },
    ];
    const bridge = makeBridge(bp);
    const res = await handleWriteAutomation(
      { clipPath: "scene0/slot0", devicePath: "t0/d0", parameter: "Filter Freq", breakpoints: bp, clear: true },
      bridge,
    );

    expect(bridge.writeClipEnvelope).toHaveBeenCalledOnce();
    expect(res).toStrictEqual({ param: "Filter Freq", written: 2, verified: true });
  });

  it("meldet verified:false bei Soll/Ist-Abweichung", async () => {
    const bridge = makeBridge([{ time: 0, value: 999 }]);
    const res = await handleWriteAutomation(
      { clipPath: "scene0/slot0", devicePath: "t0/d0", parameter: "Filter Freq", breakpoints: [{ time: 0, value: 200 }], clear: true },
      bridge,
    );

    expect(res.verified).toBe(false);
  });

  it("schreibt in <=10er-Batches (12 Punkte -> 2 Calls), clear nur im ersten Batch", async () => {
    const bp = Array.from({ length: 12 }, (_, i) => ({ time: i, value: 100 + i }));
    const bridge = makeBridge(bp);

    await handleWriteAutomation(
      { clipPath: "scene0/slot0", devicePath: "t0/d0", parameter: "Filter Freq", breakpoints: bp, clear: true },
      bridge,
    );
    expect(bridge.writeClipEnvelope).toHaveBeenCalledTimes(2);
    expect(bridge.writeClipEnvelope.mock.calls[0][0].clear).toBe(true);
    expect(bridge.writeClipEnvelope.mock.calls[1][0].clear).toBe(false);
  });

  it("propagiert Validierungsfehler (value ausserhalb range)", async () => {
    const bridge = makeBridge([]);

    await expect(
      handleWriteAutomation(
        { clipPath: "scene0/slot0", devicePath: "t0/d0", parameter: "Filter Freq", breakpoints: [{ time: 0, value: 99999 }], clear: true },
        bridge,
      ),
    ).rejects.toThrow(/ausserhalb/);
  });
});
