// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { toolDefUpdateDevice } from "#src/tools/device/update/update-device.def.ts";
import { toolDefUpdateTrack } from "#src/tools/track/update/update-track.def.ts";
import { gainDbParam } from "../gain-db-param.ts";

describe("gainDbParam", () => {
  const gainDb = gainDbParam(6);

  it("coerces numbers and holds them to the fader's range", () => {
    expect(gainDb.parse("-6")).toBe(-6);
    expect(gainDb.parse(-70)).toBe(-70);
    expect(() => gainDb.parse(7)).toThrow(/expected number to be <=6/);
    expect(() => gainDb.parse(-71)).toThrow(/expected number to be >=-70/);
  });

  it('takes "-inf", the way a read reports the bottom of the fader', () => {
    expect(gainDb.parse("-inf")).toBe(-70);
    expect(gainDb.parse(" -Inf ")).toBe(-70);
  });

  it("refuses any other text", () => {
    expect(() => gainDb.parse("inf")).toThrow(/expected number/);
    expect(() => gainDb.parse("quiet")).toThrow(/expected number/);
  });

  it("publishes a plain number", () => {
    expect(z.toJSONSchema(z.object({ gainDb }))).toStrictEqual(
      expect.objectContaining({
        properties: { gainDb: { type: "number", minimum: -70, maximum: 6 } },
      }),
    );
  });
});

describe.each([
  ["ppal-update-track", toolDefUpdateTrack],
  ["ppal-update-device", toolDefUpdateDevice],
] as const)('%s: a gain read back as "-inf"', (_name, def) => {
  const schema = z.object(def.toolOptions.inputSchema);

  it("is accepted as gainDb", () => {
    expect(schema.parse({ gainDb: "-inf" })).toStrictEqual(
      expect.objectContaining({ gainDb: -70 }),
    );
  });

  it("is accepted as a send's gainDb", () => {
    expect(
      schema.parse({ sends: [{ return: "A", gainDb: "-inf" }] }),
    ).toStrictEqual(
      expect.objectContaining({ sends: [{ return: "A", gainDb: -70 }] }),
    );
  });
});
