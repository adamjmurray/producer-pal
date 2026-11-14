// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The wrappers are written before the device loads, so a failure after that has
// to say User Library files changed.

import { describe, expect, it, vi } from "vitest";
import { type PluginHostPart } from "#src/tools/core/helpers/manage-contract.ts";
import {
  addProducerPalCall,
  connectsAfter,
  failure,
  happyDeps,
  requestAnswers,
  responseText,
  SENT_TIMEOUT,
  UNSENT_TIMEOUT,
} from "./offline-add-producer-pal-test-helpers.ts";

const WRAPPERS: PluginHostPart[] = [
  { name: "PPal Plug-in Effect", status: "updated", path: "/e" },
  { name: "PPal Plug-in Instrument", status: "current", path: "/i" },
];
const NOTE =
  "Plug-in host wrappers: PPal Plug-in Effect updated; PPal Plug-in Instrument already installed.";

describe("add-producer-pal's wrappers when it fails after writing them", () => {
  it.each([
    ["a refused load", failure(409, "Producer Pal isn't there")],
    ["a missing device file", failure(404, "no device found")],
    ["a request that never left", UNSENT_TIMEOUT],
    ["a load that may have happened", SENT_TIMEOUT],
    ["a server error", failure(500, "boom")],
  ])("adds what they did to %s", async (_why, answer) => {
    const deps = happyDeps({
      installPluginHost: vi.fn(() => WRAPPERS),
      request: requestAnswers(answer),
    });
    const response = await addProducerPalCall(deps);

    expect(response.isError).toBe(true);
    expect(responseText(response).endsWith(NOTE)).toBe(true);
  });

  it("adds what they did when the device's server never answers", async () => {
    const deps = happyDeps({ installPluginHost: vi.fn(() => WRAPPERS) });
    const response = await addProducerPalCall(
      deps,
      connectsAfter(Number.POSITIVE_INFINITY),
    );

    expect(response.isError).toBe(true);
    expect(responseText(response).endsWith(NOTE)).toBe(true);
  });

  it("adds nothing when there are no wrappers", async () => {
    const deps = happyDeps({ request: requestAnswers(UNSENT_TIMEOUT) });
    const text = responseText(await addProducerPalCall(deps));

    expect(text).not.toContain("Plug-in host wrappers");
  });

  it("leaves them out of a refusal before they were written", async () => {
    const deps = happyDeps({
      findBundledDevice: () => null,
      installPluginHost: vi.fn(() => WRAPPERS),
    });
    const text = responseText(await addProducerPalCall(deps));

    expect(deps.installPluginHost).not.toHaveBeenCalled();
    expect(text).not.toContain("Plug-in host wrappers");
  });
});
