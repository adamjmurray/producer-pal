// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { isSetupCall } from "../offline-call.ts";

describe("isSetupCall", () => {
  it.each([
    "install-producer-pal",
    "install-remote-script",
    "add-producer-pal",
    "update-producer-pal",
  ])("is true for ppal-manage %s", (action) => {
    expect(isSetupCall("ppal-manage", { action }, true)).toBe(true);
  });

  it.each([
    ["undo", "ppal-manage", true],
    ["add-producer-pal", "ppal-manage", false],
    ["add-producer-pal", "ppal-read-live-set", true],
  ])("is false for %s on %s when offered is %s", (action, name, offered) => {
    expect(isSetupCall(name, { action }, offered)).toBe(false);
  });
});
