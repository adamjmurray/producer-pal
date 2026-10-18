// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A throw after part of a chain's mixer landed names each piece that did, once:
// the gain, the pan and every send that was written.

import { beforeEach, describe, expect, it } from "vitest";
import { type RegisteredMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  LIVE_FAILURE,
  failOnSet,
} from "#src/tools/shared/tests/write-conformance/write-conformance-fixtures.ts";
import { updateDevice } from "../../update-device.ts";
import { registerChainMixer } from "./chain-mixer-test-helpers.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

describe("updateDevice - a throw after part of a chain mixer landed", () => {
  let chain: RegisteredMockObject;
  let panning: RegisteredMockObject;

  beforeEach(() => {
    ({ chain, panning } = registerChainMixer("DrumChain"));
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
