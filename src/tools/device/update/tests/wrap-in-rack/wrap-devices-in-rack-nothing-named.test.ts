// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import "../update-device-test-helpers.ts";
import { wrapDevicesInRack } from "../../helpers/wrap/wrap-devices-in-rack.ts";

describe("wrapDevicesInRack", () => {
  it("refuses a call that names no device, with no reason to add", () => {
    expect(() => wrapDevicesInRack({})).toThrow(
      /^wrapInRack found no devices to wrap$/,
    );
  });
});
