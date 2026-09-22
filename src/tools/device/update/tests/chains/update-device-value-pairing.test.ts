// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  keepsParamValue,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { resolveToolSchema } from "#src/tools/shared/tool-framework/resolve-tool-schema.ts";
import { toolDefUpdateDevice } from "../../update-device.def.ts";
import { updateDevice } from "../../update-device.ts";
import "#src/live-api-adapter/live-api-extensions.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

describe("updateDevice - per-target numbers", () => {
  const rackPath = livePath.track(0).device(0);
  let chains: RegisteredMockObject[];
  let volumes: RegisteredMockObject[];

  beforeEach(() => {
    chains = [];
    volumes = [];

    for (const index of [0, 1, 2]) {
      const chainPath = rackPath.chain(index);
      const mixerPath = `${chainPath} mixer_device`;

      chains.push(
        registerMockObject(`chain-${index}`, {
          path: chainPath,
          type: "DrumChain",
        }),
      );
      registerMockObject(`mixer-${index}`, {
        path: mixerPath,
        properties: { sends: children() },
      });
      volumes.push(
        registerMockObject(`volume-${index}`, {
          path: `${mixerPath} volume`,
          properties: { display_value: 0 },
        }),
      );
      registerMockObject(`panning-${index}`, {
        path: `${mixerPath} panning`,
        properties: { value: 0 },
      });
    }
  });

  it("gives each chain the gain at its own position", () => {
    for (const [index, level] of [-6, -12, -18].entries()) {
      keepsParamValue(volumes[index] as RegisteredMockObject, level);
    }

    const result = updateDevice({
      id: "chain-0,chain-1,chain-2",
      gainDb: "-6,-12,-18",
    });

    expect(volumes[0]?.set).toHaveBeenCalledWith("display_value", -6);
    expect(volumes[1]?.set).toHaveBeenCalledWith("display_value", -12);
    expect(volumes[2]?.set).toHaveBeenCalledWith("display_value", -18);
    // Every chain took the level asked for, so no entry has anything to say.
    expect(result).toStrictEqual([
      { id: "chain-0", path: "t0/d0/c0" },
      { id: "chain-1", path: "t0/d0/c1" },
      { id: "chain-2", path: "t0/d0/c2" },
    ]);
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("gives every chain the one value a call with no list names", () => {
    for (const volume of volumes) {
      keepsParamValue(volume, -6);
    }

    updateDevice({ id: "chain-0,chain-1,chain-2", gainDb: "-6" });

    for (const volume of volumes) {
      expect(volume.set).toHaveBeenCalledWith("display_value", -6);
    }
  });

  it("refuses a list of the wrong length before writing anything", () => {
    expect(() =>
      updateDevice({ id: "chain-0,chain-1,chain-2", gainDb: "-6,-12" }),
    ).toThrow(
      "id names 3 entries but gainDb names 2 entries. Comma-separated params",
    );

    for (const volume of volumes) {
      expect(volume.set).not.toHaveBeenCalled();
    }
  });

  it("refuses a list with an empty entry", () => {
    expect(() =>
      updateDevice({ id: "chain-0,chain-1,chain-2", chokeGroup: "1,,2" }),
    ).toThrow('invalid chokeGroup "1,,2" - it has an empty entry');
  });

  it("pairs chokeGroup down the list", () => {
    updateDevice({ id: "chain-0,chain-1,chain-2", chokeGroup: "1,2,0" });

    expect(chains[0]?.set).toHaveBeenCalledWith("choke_group", 1);
    expect(chains[1]?.set).toHaveBeenCalledWith("choke_group", 2);
    expect(chains[2]?.set).toHaveBeenCalledWith("choke_group", 0);
  });

  // A paired value is skipped per entry the same way a broadcast one is: the
  // target that can't take it says so, and the rest still get theirs.
  it("refuses one entry on a target with no choke group, and keeps the rest", () => {
    const plainChain = registerMockObject("chain-plain", {
      path: rackPath.chain(3),
      type: "Chain",
    });

    const result = updateDevice({
      id: "chain-0,chain-plain",
      chokeGroup: "1,2",
    });

    expect(chains[0]?.set).toHaveBeenCalledWith("choke_group", 1);
    expect(plainChain.set).not.toHaveBeenCalledWith(
      "choke_group",
      expect.anything(),
    );
    expect(result).toStrictEqual([
      { id: "chain-0", path: "t0/d0/c0" },
      {
        id: "chain-plain",
        ok: false,
        reason: "chokeGroup not applicable to a chain",
      },
    ]);
    expect(capturedWarnings()).toStrictEqual([]);
  });

  // The schema takes a lone typed value and hands the handler a string, which
  // is what lets the same param carry a list.
  describe("through the published schema", () => {
    const { validating } = resolveToolSchema(
      toolDefUpdateDevice.toolOptions.inputSchema,
      {},
    );

    it("coerces a number to a one-entry string", () => {
      expect(validating.gainDb?.safeParse(-6).data).toBe("-6");
      expect(validating.chokeGroup?.safeParse(2).data).toBe("2");
    });

    it("refuses an entry out of range, a fraction, and a blank", () => {
      expect(validating.gainDb?.safeParse("-6,99").success).toBe(false);
      expect(validating.chokeGroup?.safeParse("1.5").success).toBe(false);
      expect(validating.gainDb?.safeParse("").success).toBe(false);
    });
  });
});
