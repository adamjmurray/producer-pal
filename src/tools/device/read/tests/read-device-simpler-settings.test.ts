// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A Simpler read lists its pitch bend ranges among its params when the remote
// script is running, and reads as it always did when it isn't.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import { SIMPLER_SETTINGS_ROUTES } from "#src/tools/shared/remote-script/simpler-settings-contract.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  clearMockRegistry,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  pathsAsked as macroPathsAsked,
  remoteScriptSays,
} from "../../tests/helpers/rack-macros-route-fixtures.ts";
import {
  bend,
  remoteScriptReads,
  simplerPathsRead,
} from "../../tests/helpers/simpler-settings-route-fixtures.ts";
import { addSimplerSettings } from "../helpers/read-simpler-settings.ts";
import { findInReadResult } from "../helpers/find-in-read-result.ts";
import { readDevice } from "../read-device.ts";

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn(),
  handleNodeResponse: vi.fn(),
}));

const FIRST = String(livePath.track(0).device(0));
const SECOND = String(livePath.track(0).device(1));

/**
 * Register a Simpler.
 * @param id - Its id
 * @param path - Where it sits
 */
function registerSimpler(id: string, path: string): void {
  registerMockObject(id, {
    path,
    type: "SimplerDevice",
    properties: {
      name: "Simpler",
      class_display_name: "Simpler",
      type: 1,
      can_have_chains: 0,
      can_have_drum_pads: 0,
      is_active: 1,
      multi_sample_mode: 0,
      parameters: [],
    },
  });
}

/**
 * The pitch bend entries a read listed among its params.
 * @param result - What the read gave
 * @returns Each `{name, value}`, in the order listed
 */
function bendParams(result: unknown): unknown[] {
  const { parameters } = result as { parameters?: Array<{ name: string }> };

  return (parameters ?? []).filter((param) =>
    /PitchBendRange$/i.test(param.name),
  );
}

describe("readDevice of a Simpler with the remote script", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
    registerSimpler("simpler-1", FIRST);
  });

  it("lists both pitch bend ranges among the params", async () => {
    remoteScriptReads(bend(12, 24));

    expect(
      bendParams(await readDevice({ id: "simpler-1", include: ["params"] })),
    ).toStrictEqual([
      { name: "pitchBendRange", value: 12 },
      { name: "notePitchBendRange", value: 24 },
    ]);
    expect(simplerPathsRead()).toStrictEqual([[FIRST]]);
  });

  it("waits only a few seconds for the answer", async () => {
    remoteScriptReads(bend(5, 48));

    await readDevice({ id: "simpler-1", include: ["params"] });

    expect(vi.mocked(requestNode).mock.calls[0]?.[2]).toBe(3000);
  });

  it("asks once for every Simpler a list reads", async () => {
    registerSimpler("simpler-2", SECOND);
    remoteScriptReads(bend(1, 2), bend(3, 4));

    const result = (await readDevice({
      id: "simpler-1,simpler-2",
      include: ["params"],
    })) as unknown[];

    expect(result.map((entry) => bendParams(entry)[0])).toStrictEqual([
      { name: "pitchBendRange", value: 1 },
      { name: "pitchBendRange", value: 3 },
    ]);
    expect(simplerPathsRead()).toStrictEqual([[FIRST, SECOND]]);
  });

  it("doesn't ask when the read doesn't list the params", async () => {
    await readDevice({ id: "simpler-1" });
    await readDevice({ id: "simpler-1", include: ["sample"] });

    expect(requestNode).not.toHaveBeenCalled();
  });

  it("lists only the params a search matches, and doesn't ask when none does", async () => {
    remoteScriptReads(bend(12, 24));

    expect(
      bendParams(await readDevice({ id: "simpler-1", paramSearch: "NOTE" })),
    ).toStrictEqual([{ name: "notePitchBendRange", value: 24 }]);

    vi.mocked(requestNode).mockClear();

    expect(
      bendParams(await readDevice({ id: "simpler-1", paramSearch: "volume" })),
    ).toStrictEqual([]);
    expect(requestNode).not.toHaveBeenCalled();
  });

  it("leaves out the Simplers the remote script can't read", async () => {
    registerSimpler("simpler-2", SECOND);
    remoteScriptReads({ error: "not a Simpler" }, bend(3, 4));

    const result = (await readDevice({
      id: "simpler-1,simpler-2",
      include: ["params"],
    })) as unknown[];

    expect(result.map((entry) => bendParams(entry).length)).toStrictEqual([
      0, 2,
    ]);
  });

  it("reaches a Simpler nested in a result, and ignores other devices", async () => {
    registerSimpler("inner", SECOND);
    remoteScriptReads(bend(7, 9));
    const inner = { id: "inner", type: "instrument: Simpler", parameters: [] };
    const result = {
      id: "outer",
      type: "instrument: Drift",
      parameters: [],
      chains: [{ devices: [inner] }],
    };

    await addSimplerSettings([result], undefined);

    expect(inner.parameters).toStrictEqual([
      { name: "pitchBendRange", value: 7 },
      { name: "notePitchBendRange", value: 9 },
    ]);
    expect(result.parameters).toStrictEqual([]);
    expect(simplerPathsRead()).toStrictEqual([[SECOND]]);
  });

  it("puts them after the other pseudo-params and ahead of the parameters", async () => {
    remoteScriptReads(bend(7, 9));
    const simpler = {
      id: "simpler-1",
      type: "instrument: Simpler",
      parameters: [
        { name: "voices", value: 8 },
        { id: "9", name: "Volume" },
      ],
    };

    await addSimplerSettings([simpler], undefined);

    expect(simpler.parameters.map((param) => param.name)).toStrictEqual([
      "voices",
      "pitchBendRange",
      "notePitchBendRange",
      "Volume",
    ]);
  });
});

describe("readDevice of a rack and a Simpler when the remote script stalls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
    registerSimpler("simpler-1", FIRST);
    registerMockObject("rack-1", {
      path: SECOND,
      type: "RackDevice",
      properties: {
        name: "Instrument Rack",
        class_display_name: "Instrument Rack",
        type: 1,
        can_have_chains: 1,
        can_have_drum_pads: 0,
        is_active: 1,
        parameters: [],
        visible_macro_count: 8,
        has_macro_mappings: 1,
      },
    });
  });

  it("asks about both when it answers", async () => {
    vi.mocked(requestNode).mockImplementation(async (route) => ({
      success: true,
      result: {
        available: true,
        result:
          route === SIMPLER_SETTINGS_ROUTES.read
            ? { simplers: [bend(1, 2)] }
            : { racks: [{ mapped: [3] }] },
      },
    }));

    await readDevice({ id: "simpler-1,rack-1", include: ["params"] });

    expect(macroPathsAsked()).toStrictEqual([[SECOND]]);
    expect(simplerPathsRead()).toStrictEqual([[FIRST]]);
  });

  it("doesn't ask about the Simpler after the macros got no answer", async () => {
    vi.mocked(requestNode).mockResolvedValue({ success: false, error: "x" });

    const result = (await readDevice({
      id: "simpler-1,rack-1",
      include: ["params"],
    })) as unknown[];

    expect(requestNode).toHaveBeenCalledTimes(1);
    expect(bendParams(result[0])).toStrictEqual([]);
  });

  it("still asks about the Simpler when the macros are merely unreadable", async () => {
    remoteScriptSays({ error: "not a rack" });

    await readDevice({ id: "simpler-1,rack-1", include: ["params"] });

    expect(requestNode).toHaveBeenCalledTimes(2);
  });
});

describe("findInReadResult", () => {
  const isNamed = (record: object): record is { name: string } =>
    "name" in record;

  it("finds matches at any depth, outermost first, through lists and objects", () => {
    const tree = [
      { name: "a", chains: [{ devices: [{ name: "b" }, { other: 1 }] }] },
      "text",
      null,
      { name: "c" },
    ];

    expect(
      findInReadResult(tree, isNamed).map((found) => found.name),
    ).toStrictEqual(["a", "b", "c"]);
  });

  it("finds nothing in a value that isn't an object", () => {
    expect(findInReadResult(3, isNamed)).toStrictEqual([]);
  });
});

describe("readDevice of a Simpler without an answer from the remote script", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
    registerSimpler("simpler-1", FIRST);
  });

  /**
   * Read the Simpler's params.
   * @returns What the read gave
   */
  async function readParams(): Promise<unknown> {
    return await readDevice({ id: "simpler-1", include: ["params"] });
  }

  it("reads as before when the remote script isn't running", async () => {
    vi.mocked(requestNode).mockResolvedValue({
      success: true,
      result: { available: false },
    });

    expect(bendParams(await readParams())).toStrictEqual([]);
  });

  it("reads as before when it is too slow", async () => {
    vi.mocked(requestNode).mockResolvedValue({
      success: false,
      error: "timed out",
    });

    expect(bendParams(await readParams())).toStrictEqual([]);
  });

  it("reads as before when the route throws", async () => {
    vi.mocked(requestNode).mockRejectedValue(new Error("channel closed"));

    expect(bendParams(await readParams())).toStrictEqual([]);
  });

  it("reads as before when the remote script refuses", async () => {
    vi.mocked(requestNode).mockResolvedValue({
      success: true,
      result: { available: true, error: "device_paths is empty" },
    });

    expect(bendParams(await readParams())).toStrictEqual([]);
  });

  it("reads as before when no time is left to ask", async () => {
    expect(
      bendParams(
        await readDevice(
          { id: "simpler-1", include: ["params"] },
          { deadline: Date.now() - 1 },
        ),
      ),
    ).toStrictEqual([]);
    expect(requestNode).not.toHaveBeenCalled();
  });
});
