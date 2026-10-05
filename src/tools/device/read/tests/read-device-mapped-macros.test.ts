// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A rack read says which macros are mapped when the remote script is running,
// and only whether it has any when it isn't.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  clearMockRegistry,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  pathsAsked,
  remoteScriptSays,
} from "../../tests/helpers/rack-macros-route-fixtures.ts";
import { readDevice } from "../read-device.ts";
import { addMappedMacros } from "../helpers/read-mapped-macros.ts";

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn(),
  handleNodeResponse: vi.fn(),
}));

const FIRST = String(livePath.track(0).device(0));
const SECOND = String(livePath.track(0).device(1));

/**
 * Register an Instrument Rack.
 * @param id - Its id
 * @param path - Where it sits
 * @param macros - How many macros it shows, and whether any is mapped
 * @param macros.count - Visible macros
 * @param macros.mapped - Whether the rack has any mapping
 */
function registerRack(
  id: string,
  path: string,
  { count, mapped }: { count: number; mapped: boolean },
): void {
  registerMockObject(id, {
    path,
    type: "Device",
    properties: {
      name: "Instrument Rack",
      class_display_name: "Instrument Rack",
      type: 1,
      can_have_chains: 1,
      can_have_drum_pads: 0,
      is_active: 1,
      parameters: [],
      visible_macro_count: count,
      has_macro_mappings: mapped ? 1 : 0,
    },
  });
}

/**
 * Read both racks, with params, and take each one's macros.
 * @returns Each rack's macros, in the order read
 */
async function macrosOfBothRacks(): Promise<unknown[]> {
  const result = (await readDevice({
    id: "rack-1,rack-2",
    include: ["params"],
  })) as Array<{ macros: unknown }>;

  return result.map((entry) => entry.macros);
}

describe("readDevice with the remote script", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
    registerRack("rack-1", FIRST, { count: 8, mapped: true });
  });

  it("names the mapped macros instead of saying there are some", async () => {
    remoteScriptSays({ mapped: [7] });

    expect(
      await readDevice({ id: "rack-1", include: ["params"] }),
    ).toStrictEqual(
      expect.objectContaining({ macros: { count: 8, mapped: [7] } }),
    );
    expect(pathsAsked()).toStrictEqual([[FIRST]]);
  });

  it("says when mapped macros are hidden", async () => {
    remoteScriptSays({ mapped: [3, 9, 12] });

    expect(
      await readDevice({ id: "rack-1", include: ["params"] }),
    ).toStrictEqual(
      expect.objectContaining({
        macros: { count: 8, mapped: [3], hiddenMapped: [9, 12] },
      }),
    );
  });

  it("gives an empty list for a rack with no mappings", async () => {
    registerRack("rack-1", FIRST, { count: 4, mapped: false });
    remoteScriptSays({ mapped: [] });

    expect(
      await readDevice({ id: "rack-1", include: ["params"] }),
    ).toStrictEqual(
      expect.objectContaining({ macros: { count: 4, mapped: [] } }),
    );
  });

  it("waits only a few seconds for the answer", async () => {
    remoteScriptSays({ mapped: [7] });

    await readDevice({ id: "rack-1", include: ["params"] });

    expect(vi.mocked(requestNode).mock.calls[0]?.[2]).toBe(3000);
  });

  it("asks once for every rack a list reads", async () => {
    registerRack("rack-2", SECOND, { count: 8, mapped: true });
    remoteScriptSays({ mapped: [1] }, { mapped: [2, 3] });

    expect(await macrosOfBothRacks()).toStrictEqual([
      { count: 8, mapped: [1] },
      { count: 8, mapped: [2, 3] },
    ]);
    expect(pathsAsked()).toStrictEqual([[FIRST, SECOND]]);
  });

  it("doesn't ask when the read doesn't include macros", async () => {
    await readDevice({ id: "rack-1" });

    expect(requestNode).not.toHaveBeenCalled();
  });

  it("keeps the other racks' answers when one can't be read", async () => {
    registerRack("rack-2", SECOND, { count: 8, mapped: true });
    remoteScriptSays({ error: "not a rack" }, { mapped: [2] });

    expect(await macrosOfBothRacks()).toStrictEqual([
      { count: 8, hasMappings: true },
      { count: 8, mapped: [2] },
    ]);
  });

  it("reaches racks nested in a result", async () => {
    registerRack("inner", SECOND, { count: 8, mapped: true });
    remoteScriptSays({ mapped: [5] });
    const result = {
      id: "outer",
      chains: [
        {
          devices: [{ id: "inner", macros: { count: 8, hasMappings: true } }],
        },
      ],
    };

    await addMappedMacros([result], undefined);

    expect(result.chains[0]?.devices[0]?.macros).toStrictEqual({
      count: 8,
      mapped: [5],
    });
    expect(pathsAsked()).toStrictEqual([[SECOND]]);
  });
});

describe("readDevice without an answer from the remote script", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
    registerRack("rack-1", FIRST, { count: 8, mapped: true });
  });

  const OLD_READ = expect.objectContaining({
    macros: { count: 8, hasMappings: true },
  });

  it("says only that the rack has mappings when it isn't running", async () => {
    vi.mocked(requestNode).mockResolvedValue({
      success: true,
      result: { available: false },
    });

    expect(
      await readDevice({ id: "rack-1", include: ["params"] }),
    ).toStrictEqual(OLD_READ);
  });

  it("still reads the rack when the route fails", async () => {
    vi.mocked(requestNode).mockResolvedValue({
      success: false,
      error: "timed out",
    });

    expect(
      await readDevice({ id: "rack-1", include: ["params"] }),
    ).toStrictEqual(OLD_READ);
  });

  it("still reads the rack when the route throws", async () => {
    vi.mocked(requestNode).mockRejectedValue(new Error("channel closed"));

    expect(
      await readDevice({ id: "rack-1", include: ["params"] }),
    ).toStrictEqual(OLD_READ);
  });

  it("still reads the rack when the remote script refuses", async () => {
    vi.mocked(requestNode).mockResolvedValue({
      success: true,
      result: { available: true, error: "unknown route" },
    });

    expect(
      await readDevice({ id: "rack-1", include: ["params"] }),
    ).toStrictEqual(OLD_READ);
  });

  it("still reads the rack when no time is left to ask", async () => {
    expect(
      await readDevice(
        { id: "rack-1", include: ["params"] },
        { deadline: Date.now() - 1 },
      ),
    ).toStrictEqual(OLD_READ);
    expect(requestNode).not.toHaveBeenCalled();
  });
});
