// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { VERSION } from "#src/shared/config.ts";
import { offlineGuidance, SETUP_URL } from "../offline-guidance.ts";
import {
  fakeOfflineDeps,
  NOT_RUNNING,
  RUNNING,
} from "./offline-test-helpers.ts";

/**
 * @param running - Whether the remote script answers
 * @param manageOffered - Whether the portal lists ppal-manage
 * @returns The guidance text, after checking it is an error
 */
async function guidance(
  running: boolean,
  manageOffered: boolean,
): Promise<string> {
  const deps = fakeOfflineDeps({
    ping: vi.fn(() => Promise.resolve(running ? RUNNING : NOT_RUNNING)),
  });
  const response = await offlineGuidance(manageOffered, deps);

  expect(response.isError).toBe(true);

  return response.content[0]?.text ?? "";
}

describe("offlineGuidance", () => {
  it("says to run Live with the device when the remote script isn't running", async () => {
    const text = await guidance(false, false);

    expect(text).toContain("Cannot connect to Ableton Live.");
    expect(text).toContain("Live 12.3+ is running with the Producer Pal");
    expect(text).toContain(SETUP_URL);
    expect(text).not.toContain("ppal-manage");
    expect(text).toContain(`(Producer Pal ${VERSION})`);
  });

  it("points at the install that works without the device when ppal-manage is offered", async () => {
    const text = await guidance(false, true);

    expect(text).toContain("Cannot connect to Ableton Live.");
    expect(text).toContain('ppal-manage action "install-remote-script"');
    expect(text).toContain("restart Live");
    expect(text).toContain(`(Producer Pal ${VERSION})`);
  });

  it("says the device is missing when Live's remote script answers", async () => {
    const text = await guidance(true, false);

    expect(text).toContain("Producer Pal isn't in this Live Set.");
    expect(text).toContain(SETUP_URL);
    expect(text).not.toContain("ppal-manage");
    expect(text).toContain(`(Producer Pal ${VERSION})`);
  });

  it("asks once and waits for no one else's answer", async () => {
    const ping = vi.fn(() => Promise.resolve(NOT_RUNNING));

    await offlineGuidance(true, { ping });

    expect(ping).toHaveBeenCalledTimes(1);
  });
});
