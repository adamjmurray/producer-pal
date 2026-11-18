// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Ableton quitting mid-call drops the device's HTTP connection. The SDK reports
// the dropped stream but leaves the call waiting, so it used to sit until the
// portal's timeout, past most clients' own. Run with: npm run e2e:portal

import { describe, expect, it } from "vitest";
import {
  callToolText,
  startPortal,
  stopAfterEach,
} from "../portal-test-helpers";
import { createStubDevice, SLOW_TOOL, SLOW_TOOL_MS } from "../stub-device";

const track = stopAfterEach();

describe("The device goes away while a call is in flight", () => {
  it("answers the call right away, as a fresh call would", async () => {
    const device = track(await createStubDevice({ slowTool: true }));
    const portal = track(await startPortal(device.origin));
    const slow = callToolText(portal, SLOW_TOOL);

    await new Promise((resolve) => setTimeout(resolve, SLOW_TOOL_MS / 4));

    const stoppedAt = Date.now();

    await device.stop();

    const inFlight = await slow;

    // Well under any timeout: the drop answered it, not a clock.
    expect(Date.now() - stoppedAt).toBeLessThan(SLOW_TOOL_MS * 3);
    expect(inFlight).toStrictEqual(await callToolText(portal, SLOW_TOOL));
  });
});
