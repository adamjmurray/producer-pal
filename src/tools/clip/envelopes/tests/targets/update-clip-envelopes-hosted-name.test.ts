// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// update-clip's `envelopes` on a hosted plug-in's param named by its wrapper's
// path and the plug-in's own name for the param.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/protocols/node-request-v8-protocol.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  clearMockRegistry,
  lookupMockObject,
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { ENVELOPE_ROUTES } from "#src/tools/clip/envelopes/remote-script-envelope-contract.ts";
import {
  setupMidiClipMock,
  setupUpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import {
  infoReply,
  installWrapper,
  registerWrapperDevice,
  type WrapperMessage,
} from "#src/tools/device/tests/helpers/plugin-host-wrapper-fixtures.ts";
import {
  NO_PLUGIN_LOADED,
  PLUGIN_NOT_LOADED,
} from "#src/tools/shared/device/helpers/params/hosted-plugin-reading.ts";
import {
  answerAsWrapper,
  answerRoutes,
  heardOp,
  routeArgs,
  setupTrack,
  type Wrapper,
} from "./hosted-envelope-test-helpers.ts";

vi.mock(
  import("#src/live-api-adapter/protocols/node-request-v8-protocol.ts"),
  () => ({
    requestNode: vi.fn(),
    handleNodeResponse: vi.fn(),
  }),
);

/**
 * Write one point to a target on clip 123.
 * @param target - The target
 * @returns The clip's entry
 */
function write(target: string) {
  return updateClip({ id: "123", envelopes: `${target}: 1|1 0.2` });
}

describe("updateClip - envelopes on a hosted param named by path and name", () => {
  let wrapper: Wrapper;

  /**
   * Make the wrapper's plug-in have these params by this name.
   * @param matches - The plug-in's numbers for the params the name reaches
   */
  function nameReaches(...matches: number[]): void {
    wrapper.lookup = () => ({
      success: true,
      matches: matches.map((index) => ({ index, name: "Cutoff" })),
    });
  }

  beforeEach(() => {
    clearMockRegistry();
    setupMidiClipMock(setupUpdateClipMocks().clip123);
    answerRoutes();
    setupTrack();
    wrapper = answerAsWrapper([{ slot: 2, index: 206, name: "Cutoff" }]);
  });

  it("writes the slot of the param the name reaches", async () => {
    nameReaches(206);

    const result = await write("t0/d0/Cutoff");

    expect(result).toStrictEqual(expect.objectContaining({ envelopes: 1 }));
    expect(heardOp(wrapper, "lookup")).toStrictEqual([
      expect.objectContaining({ name: "Cutoff" }),
    ]);
    expect(routeArgs(ENVELOPE_ROUTES.write)).toStrictEqual(
      expect.objectContaining({ device: "d0", parameter: 2 }),
    );
  });

  it("refuses the name and the h id of one param together", async () => {
    nameReaches(206);

    const result = await updateClip({
      id: "123",
      envelopes: "t0/d0/Cutoff: 1|1 0.2\nt0/d0/h206: 1|1 0.4",
    });

    expect(result).toStrictEqual(
      expect.objectContaining({
        envelopes: expect.stringContaining("are the same parameter") as string,
      }),
    );
  });

  it("names the ids when the name reaches more than one param", async () => {
    nameReaches(12, 40);

    expect(await write("t0/d0/cutoff")).toStrictEqual(
      expect.objectContaining({
        envelopes: 0,
        detail:
          'envelope "t0/d0/cutoff": "cutoff" names 2 params on t0/d0 (h12, h40), so nothing was written. Use one of those ids as the target, like t0/d0/h12.',
      }),
    );
  });

  it("leaves a name the plug-in doesn't have to the wrapper's own params", async () => {
    nameReaches();

    // The wrapper's Live params are its automation slots, by Live's names.
    expect(await write("t0/d0/Slot 001")).toStrictEqual(
      expect.objectContaining({ envelopes: 1 }),
    );
    expect(await write("t0/d0/Resonance")).toStrictEqual(
      expect.objectContaining({
        envelopes: 0,
        detail:
          'envelope "t0/d0/Resonance": t0/d0 has no param named "Resonance"',
      }),
    );
  });

  it.each([
    ["missing", "Enstriate", PLUGIN_NOT_LOADED],
    ["bare", undefined, NO_PLUGIN_LOADED],
  ])(
    "says a %s plug-in isn't loaded the way reads do",
    async (_kind, missing, reason) => {
      installWrapper({
        info: () => infoReply(null, missing),
        lookup: () => ({ success: false, error: NO_PLUGIN_LOADED }),
      });

      expect(await write("t0/d0/Cutoff")).toStrictEqual(
        expect.objectContaining({
          envelopes: 0,
          detail: `envelope "t0/d0/Cutoff": ${reason}`,
        }),
      );
    },
  );

  it.each<[string, WrapperMessage]>([
    ["no plug-in loaded", { success: false, error: NO_PLUGIN_LOADED }],
    ["an outdated wrapper", { success: false, error: "unknown op: lookup" }],
  ])(
    "leaves a name to the wrapper's own params when the lookup fails (%s)",
    async (_kind, reply) => {
      installWrapper({
        info: () => infoReply(null),
        lookup: () => reply,
      });

      const params = [] as unknown[];

      for (const name of ["Device On", "Slot 001"]) {
        expect(await write(`t0/d0/${name}`)).toStrictEqual(
          expect.objectContaining({ envelopes: 1 }),
        );
        params.push(routeArgs(ENVELOPE_ROUTES.write)?.parameter);
        vi.mocked(requestNode).mockClear();
      }

      expect(params).toStrictEqual([0, 1]);
    },
  );

  it.each<[string, WrapperMessage | undefined]>([
    ["no answer", undefined],
    ["a transient error", { success: false, error: "still loading" }],
    ["any other error", { success: false, error: "boom" }],
  ])(
    "writes nothing for the wrapper's own name when the lookup has %s",
    async (_kind, reply) => {
      installWrapper({
        info: () => infoReply("Plug"),
        lookup: reply == null ? () => undefined as never : () => reply,
      });

      const result = await write("t0/d0/Device On");

      expect(result).toStrictEqual(
        expect.objectContaining({
          envelopes: 0,
          detail: expect.stringMatching(/^envelope "t0\/d0\/Device On": /),
        }),
      );
      expect(routeArgs(ENVELOPE_ROUTES.write)).toBeUndefined();
    },
  );

  it("reports a wrapper's own name that is ambiguous after a failed lookup", async () => {
    installWrapper({
      info: () => infoReply(null),
      lookup: () => ({ success: false, error: NO_PLUGIN_LOADED }),
    });
    registerMockObject("device-on-2", {
      path: livePath.track(0).device(0).parameter(9),
      type: "DeviceParameter",
      properties: { name: "Device On" },
    });
    (
      lookupMockObject("device-123") as RegisteredMockObject
    ).properties.parameters = ["id", "device-on", "id", "device-on-2"];

    expect(await write("t0/d0/Device On")).toStrictEqual(
      expect.objectContaining({
        envelopes: 0,
        detail: expect.stringContaining('"Device On" names 2 params') as string,
      }),
    );
  });

  it("reports a wrapper on another track after a failed lookup", async () => {
    installWrapper({
      info: () => infoReply(null),
      lookup: () => ({ success: false, error: NO_PLUGIN_LOADED }),
    });
    registerWrapperDevice({
      id: "return-wrapper",
      path: String(livePath.returnTrack(0).device(0)),
    });

    expect(await write("rt0/d0/Device On")).toStrictEqual(
      expect.objectContaining({
        envelopes: 0,
        detail: expect.stringContaining(
          "rt0/d0 is not on the clip's track (t0)",
        ) as string,
      }),
    );
  });

  it("still gives the lookup's reason for a name the wrapper's own params lack", async () => {
    installWrapper({
      info: () => infoReply(null),
      lookup: () => ({ success: false, error: NO_PLUGIN_LOADED }),
    });

    expect(await write("t0/d0/Resonance")).toStrictEqual(
      expect.objectContaining({
        envelopes: 0,
        detail: `envelope "t0/d0/Resonance": ${NO_PLUGIN_LOADED}`,
      }),
    );
  });

  it.each<[WrapperMessage | undefined, string]>([
    [
      { success: false, error: "unknown op: lookup" },
      "this wrapper is out of date; create the hosted plug-in again",
    ],
    [
      { success: false, error: "boom" },
      "couldn't look up the param's name: boom",
    ],
    [undefined, "the hosted plug-in didn't answer"],
  ])("says why when the wrapper answers %j", async (reply, why) => {
    if (reply != null) {
      wrapper.lookup = () => reply;
    }

    expect(await write("t0/d0/Cutoff")).toStrictEqual(
      expect.objectContaining({
        envelopes: 0,
        detail: `envelope "t0/d0/Cutoff": ${why}`,
      }),
    );
  });
});
