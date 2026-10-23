// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Live refuses a second instrument in a chain without a reason, so the refusal
// names the cause when the chain's own devices explain it.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/protocols/node-request-v8-protocol.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { createDevice } from "../../create-device.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  warn: vi.fn(),
}));

vi.mock(
  import("#src/live-api-adapter/protocols/node-request-v8-protocol.ts"),
  () => ({
    requestNode: vi.fn(),
    handleNodeResponse: vi.fn(),
  }),
);

describe("createDevice one-instrument refusal", () => {
  beforeEach(() => {
    // No remote script answering, so only native names are valid.
    vi.mocked(requestNode).mockResolvedValue({
      success: true,
      result: { available: false },
    });
  });

  // Live gives back no id and no reason, so the refusal has to name the
  // cause itself or the caller has nothing to act on.
  it("names the instrument already there when Live refuses a second one", async () => {
    registerMockObject("track-0", {
      path: livePath.track(0),
      properties: { devices: children("existing-instrument") },
      methods: { insert_device: () => ["id", "0"] },
    });
    registerMockObject("existing-instrument", {
      path: livePath.track(0).device(0),
      properties: { type: 1, can_have_chains: 0 },
    });

    await expect(
      createDevice({ path: "t0/d+", device: "Operator" }),
    ).rejects.toThrow(
      'could not insert "Operator" at end in path "t0/d+": the ' +
        "destination already has an instrument, and only one is allowed",
    );
  });

  // An empty rack makes no sound, but Live still counts it as the one
  // instrument.
  it("names an empty rack as the instrument already there", async () => {
    registerMockObject("track-0", {
      path: livePath.track(0),
      properties: { devices: children("empty-rack") },
      methods: { insert_device: () => ["id", "0"] },
    });
    registerMockObject("empty-rack", {
      path: livePath.track(0).device(0),
      properties: { type: 1, can_have_chains: 1, chains: [] },
    });

    await expect(
      createDevice({ path: "t0/d0", device: "Operator" }),
    ).rejects.toThrow("already has an instrument, and only one is allowed");
  });

  // Nothing in the chain makes sound, so the instrument rule isn't what
  // Live refused on and the message says only what it knows.
  it("leaves the refusal bare when the cause isn't the instrument rule", async () => {
    registerMockObject("track-0", {
      path: livePath.track(0),
      properties: { devices: children("existing-effect") },
      methods: { insert_device: () => ["id", "0"] },
    });
    registerMockObject("existing-effect", {
      path: livePath.track(0).device(0),
      properties: { type: 2, can_have_chains: 0 },
    });

    await expect(
      createDevice({ path: "t0/d+", device: "Operator" }),
    ).rejects.toThrow(/could not insert "Operator" at end in path "t0\/d\+"$/);
  });
});
