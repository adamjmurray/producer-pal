// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  clearMockRegistry,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { readDevice, readOneDevice } from "../../read-device.ts";

/**
 * Register a device with that many params, named "Param 0", "Param 1"...
 * @param count - How many params
 * @param options - How the device differs from a plain one at t0/d0
 * @param options.id - Its id
 * @param options.index - Its place on track 0
 * @param options.properties - More properties, such as a specialized device's
 */
function registerDeviceWithParams(
  count: number,
  { id = "device-123", index = 0, properties = {} } = {} as {
    id?: string;
    index?: number;
    properties?: Record<string, unknown>;
  },
): void {
  const ids = Array.from({ length: count }, (_, i) => `${id}-param-${i}`);

  registerMockObject(id, {
    path: livePath.track(0).device(index),
    type: "Device",
    properties: {
      name: "Big Synth",
      class_display_name: "Big Synth",
      type: 1,
      can_have_chains: 0,
      can_have_drum_pads: 0,
      is_active: 1,
      parameters: ids.flatMap((paramId) => ["id", paramId]),
      ...properties,
    },
  });

  for (const [i, paramId] of ids.entries()) {
    registerMockObject(paramId, {
      path: livePath.track(0).device(index).parameter(i),
      type: "DeviceParameter",
      properties: { name: `Param ${i}`, original_name: `Param ${i}` },
    });
  }
}

/**
 * @param result - A device read
 * @returns The names of the params it listed
 */
function namesListed(result: Record<string, unknown>): string[] {
  return (result.parameters as { name: string }[]).map((p) => p.name);
}

describe("readOneDevice param cap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
  });

  it("lists at most 200 params and says how many there are", () => {
    registerDeviceWithParams(250);

    const result = readOneDevice({ path: "t0/d0", include: ["params"] });

    expect(result.parameters).toHaveLength(200);
    expect(result.paramCount).toBe(250);
    expect(result.detail).toBe(
      "listing params 1-200 of 250; pass paramOffset: 200 for more, or narrow with paramSearch",
    );
  });

  it("lists every param of a device at the cap", () => {
    registerDeviceWithParams(200);

    const result = readOneDevice({ path: "t0/d0", include: ["params"] });

    expect(result.parameters).toHaveLength(200);
    expect(result.paramCount).toBeUndefined();
    expect(result.detail).toBeUndefined();
  });

  it("counts only the params a search matches", () => {
    registerDeviceWithParams(250);

    const result = readOneDevice({ path: "t0/d0", paramSearch: "param 24" });

    expect(result.parameters).toHaveLength(11);
    expect(result.paramCount).toBeUndefined();
  });
});

describe("readOneDevice paramOffset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
  });

  it("lists the params after the offset, and says there are no more", () => {
    registerDeviceWithParams(250);

    const result = readOneDevice({ path: "t0/d0", paramOffset: 200 });
    const names = namesListed(result);

    expect(names).toHaveLength(50);
    expect(names[0]).toBe("Param 200");
    expect(names.at(-1)).toBe("Param 249");
    expect(result.paramCount).toBe(250);
    expect(result.detail).toBe("listing params 201-250 of 250");
  });

  it("names the next offset while params remain", () => {
    registerDeviceWithParams(450);

    const result = readOneDevice({ path: "t0/d0", paramOffset: 200 });
    const names = namesListed(result);

    expect(names).toHaveLength(200);
    expect(names[0]).toBe("Param 200");
    expect(result.paramCount).toBe(450);
    expect(result.detail).toBe(
      "listing params 201-400 of 450; pass paramOffset: 400 for more, or narrow with paramSearch",
    );
  });

  it("counts within a search's matches", () => {
    registerDeviceWithParams(250);

    // Matches: Param 1, Param 10-19, Param 100-199 (111 in all).
    const result = readOneDevice({
      path: "t0/d0",
      paramSearch: "param 1",
      paramOffset: 100,
    });
    const names = namesListed(result);

    expect(names).toHaveLength(11);
    expect(names[0]).toBe("Param 189");
    expect(result.paramCount).toBe(111);
    expect(result.detail).toBe("listing params 101-111 of 111");
  });

  it("gives no params, the count and a note when the offset is past the end", () => {
    registerDeviceWithParams(250);

    const result = readOneDevice({ path: "t0/d0", paramOffset: 250 });

    expect(result.parameters).toStrictEqual([]);
    expect(result.paramCount).toBe(250);
    expect(result.detail).toBe("paramOffset 250 is past the last param (250)");
  });

  it("pages a device that fits on one page, so the model can see it is done", () => {
    registerDeviceWithParams(30);

    const result = readOneDevice({ path: "t0/d0", paramOffset: 10 });

    expect(namesListed(result)).toHaveLength(20);
    expect(result.paramCount).toBe(30);
    expect(result.detail).toBe("listing params 11-30 of 30");
  });

  it("turns params on, but an offset of 0 alone adds nothing", () => {
    registerDeviceWithParams(30);

    expect(
      readOneDevice({ path: "t0/d0", paramOffset: 1 }).parameters,
    ).toHaveLength(29);
    expect(
      readOneDevice({ path: "t0/d0", paramOffset: 0 }).parameters,
    ).toBeUndefined();
  });

  it("lists a specialized device's pseudo-params on the first page only", () => {
    registerDeviceWithParams(250, {
      properties: { class_display_name: "EQ Eight", global_mode: 0 },
    });

    const first = readOneDevice({ path: "t0/d0", include: ["params"] });
    const second = readOneDevice({ path: "t0/d0", paramOffset: 200 });

    expect(first.parameters).toContainEqual({
      name: "globalMode",
      value: "stereo",
    });
    expect(
      namesListed(first).filter((n) => n.startsWith("Param")),
    ).toHaveLength(200);
    expect(namesListed(second)).not.toContain("globalMode");
    expect(second.parameters).toHaveLength(50);
  });

  it("applies the offset to every device a read names", async () => {
    registerDeviceWithParams(250, { id: "first" });
    registerDeviceWithParams(230, { id: "second", index: 1 });

    const results = (await readDevice({
      id: "first,second",
      paramOffset: 200,
    })) as Record<string, unknown>[];

    expect(results.map((r) => namesListed(r).length)).toStrictEqual([50, 30]);
    expect(results.map((r) => r.detail)).toStrictEqual([
      "listing params 201-250 of 250",
      "listing params 201-230 of 230",
    ]);
  });
});
