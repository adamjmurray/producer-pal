// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A CC Control's name can't be read, so its class is all that tells a copy of it
// from another kind of device with an unreadable name.

import { beforeEach, describe, expect, it } from "vitest";
import {
  identityOf,
  isCopyOf,
} from "#src/tools/actions/duplicate/helpers/device/remote-script-copy/device-copy-identity.ts";
import { registerCcControl } from "#src/tools/device/tests/helpers/cc-control-fixtures.ts";
import {
  clearMockRegistry,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";

describe("device copy identity - CC Control", () => {
  beforeEach(() => {
    clearMockRegistry();
    registerCcControl({ id: "cc-1", path: "live_set tracks 0 devices 0" });
    registerCcControl({
      id: "cc-2",
      path: "live_set tracks 0 devices 1",
      paramIdStart: 950,
    });
    registerMockObject("other", {
      path: "live_set tracks 0 devices 2",
      type: "Device",
    });
  });

  it("takes the next CC Control to be a copy of the first", () => {
    const original = identityOf(LiveAPI.from("id cc-1"));

    expect(original.className).toBe("CcControlDevice");
    expect(isCopyOf(LiveAPI.from("id cc-2"), original)).toBe(true);
  });

  it("doesn't take another kind of device with no readable name for a copy", () => {
    const original = identityOf(LiveAPI.from("id cc-1"));

    expect(isCopyOf(LiveAPI.from("id other"), original)).toBe(false);
  });
});
