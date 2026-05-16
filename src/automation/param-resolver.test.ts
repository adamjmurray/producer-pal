// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { resolveParam } from "./param-resolver.ts";

const fakeDevice = {
  parameters: [
    { name: "Filter Freq", min: 20, max: 20000 },
    { name: "Resonance", min: 0, max: 1 },
  ],
};
const lookup = async (_path: string) => fakeDevice;

describe("resolveParam", () => {
  it("loest per Name auf", async () => {
    const r = await resolveParam("t0/d0", "Filter Freq", lookup);

    expect(r).toStrictEqual({ index: 0, name: "Filter Freq", min: 20, max: 20000 });
  });
  it("loest per Index auf", async () => {
    const r = await resolveParam("t0/d0", 1, lookup);

    expect(r).toStrictEqual({ index: 1, name: "Resonance", min: 0, max: 1 });
  });
  it("wirft mit Param-Liste wenn Name unbekannt", async () => {
    await expect(resolveParam("t0/d0", "Nope", lookup)).rejects.toThrow(/verfuegbar: Filter Freq, Resonance/);
  });
  it("wirft wenn Index out of range", async () => {
    await expect(resolveParam("t0/d0", 9, lookup)).rejects.toThrow(/Index 9/);
  });
  it("wirft bei nicht-ganzzahligem Index", async () => {
    await expect(resolveParam("t0/d0", 1.5, lookup)).rejects.toThrow(/ganzzahlig|integer/i);
  });
});
