// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { VERSION } from "#src/shared/config.ts";
import { type OfflineDeps } from "../../offline/offline-deps.ts";
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
  type FakeDevice,
  OLD,
  SWAPPED,
  updateCall,
} from "./update-test-helpers.ts";

/**
 * A device whose first `answered` connects work (as `OLD`) and whose later ones
 * hang: they take the whole time limit they were given, or 60 s without one.
 * @param deps - The clock the hang advances
 * @param answered - How many connects work before the hanging starts
 * @returns The device
 */
function hangingDevice(deps: OfflineDeps, answered: number): FakeDevice {
  const device = fakeDevice(OLD);
  const works = device.connect.getMockImplementation();
  let calls = 0;

  device.connect.mockImplementation(async (timeoutMs) => {
    calls += 1;

    if (calls <= answered) {
      return await works?.(timeoutMs);
    }

    await deps.sleep(timeoutMs ?? 60_000);
    throw new Error("Request timed out");
  });

  return device;
}

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

  it("gives up on a new device whose port accepts and never answers, still inside the budget", async () => {
    const { deps, elapsed } = clockedDeps(
      () => 25_000,
      () => SWAPPED,
      { installDevice: vi.fn(installDevice) },
    );
    const device = hangingDevice(deps, 1);
    const response = await updateCall(device, deps);

    expect(response.isError).toBe(true);
    expect(responseText(response)).toContain("hasn't answered yet");
    expect(device.connect).toHaveBeenLastCalledWith(SETUP_BUDGET_MS - 25_000);
    expect(elapsed()).toBeLessThanOrEqual(SETUP_BUDGET_MS);
  });

  it("gives up on a running device that never answers the first connect, inside the budget", async () => {
    const { deps, elapsed } = clockedDeps(
      () => 0,
      () => SWAPPED,
    );
    const device = hangingDevice(deps, 0);
    const response = await updateCall(device, deps);

    expect(response.isError).toBe(true);
    expect(device.connect).toHaveBeenCalledWith(SETUP_BUDGET_MS);
    expect(elapsed()).toBeLessThanOrEqual(SETUP_BUDGET_MS);
  });
});
