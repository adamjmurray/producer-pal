// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A throw after part of a chain's mixer landed names each piece that did, once:
// the gain, the pan and every send that was written.

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  LIVE_FAILURE,
  failOnSet,
} from "#src/tools/shared/tests/write-conformance/write-conformance-fixtures.ts";
import { updateDevice } from "../../update-device.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

describe("updateDevice - a throw after part of a chain mixer landed", () => {
  const rackPath = livePath.track(0).device(0);
  const chainPath = rackPath.chain(0);
  const mixerPath = `${chainPath} mixer_device`;
  let chain: RegisteredMockObject;
  let panning: RegisteredMockObject;

  beforeEach(() => {
    chain = registerMockObject("chain-0", {
      path: chainPath,
      type: "DrumChain",
    });
    registerMockObject("mixer-0", {
      path: mixerPath,
      properties: { sends: children("send-0") },
    });
    registerMockObject("send-0");
    registerMockObject("rack-0", {
      path: rackPath,
      properties: { return_chains: children("rc-0") },
    });
    registerMockObject("rc-0", { properties: { name: "a Reverb" } });
    registerMockObject("volume-0", {
      path: `${mixerPath} volume`,
      properties: { display_value: 0 },
    });
    panning = registerMockObject("panning-0", {
      path: `${mixerPath} panning`,
      properties: { value: 0 },
    });
  });

  it("names a gain that landed before the pan threw", () => {
    failOnSet(panning);

    expect(updateDevice({ id: "chain-0", gainDb: -6, pan: 0.5 })).toStrictEqual(
      {
        id: "chain-0",
        path: "t0/d0/c0",
        detail: `${LIVE_FAILURE}; already changed: gainDb`,
      },
    );
  });

  it("names the gain and the send that landed before a later write threw", () => {
    failOnSet(chain, "choke_group");

    expect(
      updateDevice({
        id: "chain-0",
        gainDb: -6,
        sends: [{ return: "a", gainDb: -12 }],
        chokeGroup: 2,
      }),
    ).toStrictEqual({
      id: "chain-0",
      path: "t0/d0/c0",
      detail: `${LIVE_FAILURE}; already changed: gainDb, send a Reverb`,
    });
  });
});
