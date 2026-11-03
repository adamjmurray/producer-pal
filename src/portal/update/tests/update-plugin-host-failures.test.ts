// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The wrappers are written before the swap, so a failure after that has to
// say User Library files changed.

import { describe, expect, it, vi } from "vitest";
import { type PluginHostPart } from "#src/tools/core/helpers/manage-contract.ts";
import {
  failure,
  requestAnswers,
  responseText,
  SENT_TIMEOUT,
  UNSENT_TIMEOUT,
} from "../../offline/tests/offline-add-producer-pal-test-helpers.ts";
import {
  DOWN,
  fakeDevice,
  OLD,
  updateCall,
  updateDeps,
} from "./update-test-helpers.ts";

const WRAPPERS: PluginHostPart[] = [
  { name: "PPal Plug-in Effect", status: "installed", path: "/e" },
  {
    name: "PPal Plug-in Instrument",
    ok: false,
    path: "/i",
    detail: "In use.",
  },
];
const NOTE =
  "Plug-in host wrappers: PPal Plug-in Effect installed; PPal Plug-in Instrument failed: In use.";

describe("update-producer-pal's wrappers when it fails after writing them", () => {
  it.each([
    ["a refused swap", failure(409, "Producer Pal isn't in this Live Set")],
    ["a request that never left", UNSENT_TIMEOUT],
    ["a swap that may have happened", SENT_TIMEOUT],
    ["a server error", failure(500, "boom")],
  ])("adds what they did to %s", async (_why, answer) => {
    const deps = updateDeps({
      installPluginHost: vi.fn(() => WRAPPERS),
      request: requestAnswers(answer),
    });
    const response = await updateCall(fakeDevice(OLD), deps);

    expect(response.isError).toBe(true);
    expect(responseText(response).endsWith(NOTE)).toBe(true);
  });

  it("adds what they did when the new device never answers", async () => {
    const deps = updateDeps({ installPluginHost: vi.fn(() => WRAPPERS) });
    const response = await updateCall(fakeDevice(OLD, DOWN), deps);

    expect(response.isError).toBe(true);
    expect(responseText(response).endsWith(NOTE)).toBe(true);
  });

  it("adds what they did when the old device keeps answering", async () => {
    const deps = updateDeps({ installPluginHost: vi.fn(() => WRAPPERS) });
    const response = await updateCall(fakeDevice(OLD), deps);

    expect(responseText(response).endsWith(NOTE)).toBe(true);
  });

  it("adds nothing when there are no wrappers", async () => {
    const deps = updateDeps({
      request: requestAnswers(
        failure(409, "Producer Pal isn't in this Live Set"),
      ),
    });
    const text = responseText(await updateCall(fakeDevice(OLD), deps));

    expect(text).not.toContain("Plug-in host wrappers");
  });

  it("leaves them out of a refusal before they were written", async () => {
    const deps = updateDeps({ installPluginHost: vi.fn(() => WRAPPERS) });
    const text = responseText(await updateCall(fakeDevice(undefined), deps));

    expect(deps.installPluginHost).not.toHaveBeenCalled();
    expect(text).not.toContain("Plug-in host wrappers");
  });
});
