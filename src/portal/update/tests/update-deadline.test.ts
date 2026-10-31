// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { VERSION } from "#src/shared/config.ts";
import {
  clockedDeps,
  copied,
  failure,
  responseText,
} from "../../offline/tests/offline-add-producer-pal-test-helpers.ts";
import { SETUP_BUDGET_MS } from "../../setup/setup-deadline.ts";
import {
  DOWN,
  fakeDevice,
  OLD,
  SWAPPED,
  updateCall,
} from "./update-test-helpers.ts";

const installDevice = (): ReturnType<typeof copied> =>
  copied("updated", { bundledVersion: VERSION, previousVersion: OLD });

describe("update-producer-pal under a client's 60 s limit", () => {
  it("stops waiting for the new device in time for the budget, not 30 s after a slow swap", async () => {
    const { deps, elapsed } = clockedDeps(
      () => 25_000,
      () => SWAPPED,
      { installDevice: vi.fn(installDevice) },
    );
    const response = await updateCall(fakeDevice(OLD, DOWN), deps);

    expect(response.isError).toBe(true);
    expect(responseText(response)).toContain(
      "Live replaced the Producer Pal device",
    );
    expect(responseText(response)).toContain("hasn't answered yet");
    expect(elapsed()).toBeLessThanOrEqual(SETUP_BUDGET_MS);
  });

  it("stops asking about a file Live's browser hasn't found once the budget is spent", async () => {
    const { deps, elapsed } = clockedDeps(
      () => 20_000,
      () => failure(404, "no device found"),
      { installDevice: vi.fn(installDevice) },
    );
    const response = await updateCall(fakeDevice(OLD), deps);

    expect(response.isError).toBe(true);
    expect(responseText(response)).toContain(
      "Live's browser hasn't found the device file yet",
    );
    expect(elapsed()).toBeLessThanOrEqual(SETUP_BUDGET_MS);
  });
});
