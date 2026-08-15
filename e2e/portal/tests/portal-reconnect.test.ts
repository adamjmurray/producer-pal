// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The offline→online nudge: a portal that came up before Ableton did serves its
// own tool list, then has to tell the client to re-list once the device answers.
// Clients cache that list forever, so a missed nudge means a session stuck with
// the offline one. It is timing between two processes, which is why it needs a
// real portal and a device that can be switched on mid-test.
//
// Run with: npm run e2e:portal

import { describe, expect, it } from "vitest";
import {
  listToolNames,
  settle,
  startPortal,
  stopAfterEach,
} from "../portal-test-helpers";
import { createStubDevice, DEVICE_TOOL } from "../stub-device";

const track = stopAfterEach();

describe("Offline → online", () => {
  it("tells the client to re-list once the device shows up, and only once", async () => {
    const device = track(await createStubDevice({ online: false }));
    const portal = track(await startPortal(device.origin));

    // Offline, the portal answers from its own catalog, so a client gets setup
    // guidance from a real tool instead of a hard failure.
    const offline = await listToolNames(portal);

    expect(offline).toContain("ppal-connect");
    expect(offline).not.toContain(DEVICE_TOOL);
    expect(portal.toolListChanges).toBe(0);

    await device.start();

    expect(await listToolNames(portal)).toStrictEqual([DEVICE_TOOL]);

    // The device's own server is stateless — every POST /mcp is a fresh server —
    // so it can't send this. The portal holds the stdio connection, so it can.
    await expect.poll(() => portal.toolListChanges).toBe(1);

    // Spent once the client has been told: a later list doesn't nudge again.
    await listToolNames(portal);
    await settle();

    expect(portal.toolListChanges).toBe(1);
  });

  it("stays quiet when the device was there all along", async () => {
    const device = track(await createStubDevice());
    const portal = track(await startPortal(device.origin));

    expect(await listToolNames(portal)).toStrictEqual([DEVICE_TOOL]);

    await listToolNames(portal);
    await settle();

    // No fallback was ever served, so there is nothing to correct — and a
    // client that re-lists for no reason pays for the round trip.
    expect(portal.toolListChanges).toBe(0);
  });
});
