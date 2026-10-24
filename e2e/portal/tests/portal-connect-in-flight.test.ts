// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A ppal-connect to an older device reconnects, which used to cut off any other
// call in flight. Run with: npm run e2e:portal

import { describe, expect, it } from "vitest";
import {
  callToolText,
  startPortal,
  stopAfterEach,
} from "../portal-test-helpers";
import {
  createStubDevice,
  DEVICE_TOOL_REPLY,
  SLOW_TOOL,
  SLOW_TOOL_MS,
} from "../stub-device";

const track = stopAfterEach();

describe("ppal-connect beside a call in flight", () => {
  it("lets the other call finish when it reconnects to an older device", async () => {
    const device = track(
      await createStubDevice({ version: "1.0.0", slowTool: true }),
    );
    const portal = track(await startPortal(device.origin));

    const slow = callToolText(portal, SLOW_TOOL);

    await new Promise((resolve) => setTimeout(resolve, SLOW_TOOL_MS / 4));

    const connect = await callToolText(portal, "ppal-connect");

    expect(connect.isError).toBeUndefined();
    expect(await slow).toStrictEqual({
      text: DEVICE_TOOL_REPLY,
      isError: undefined,
    });
  });
});
