// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { isSetupCall } from "../offline-call.ts";
import { forwardedSetupTimeout } from "../setup-call-timeout.ts";
import { responseText } from "./offline-add-producer-pal-test-helpers.ts";

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

const INSTALL = { action: "install-producer-pal" };

describe("forwardedSetupTimeout", () => {
  it("says an install that was sent may or may not have finished", () => {
    const text = responseText(forwardedSetupTimeout(INSTALL, true));

    expect(text).toContain("may or may not have finished");
    expect(text).toContain("Run it again");
  });

  it("says nothing was installed when the install was never sent", () => {
    const text = responseText(forwardedSetupTimeout(INSTALL, false));

    expect(text).toContain("nothing was installed");
    expect(text).not.toContain("may or may not");
  });

  it("answers the retired install name the same way", () => {
    const text = responseText(
      forwardedSetupTimeout({ action: "install-remote-script" }, false),
    );

    expect(text).toContain("nothing was installed");
  });

  it("words other setup actions without claiming an install", () => {
    const add = { action: "add-producer-pal" };

    expect(responseText(forwardedSetupTimeout(add, false))).toContain(
      "nothing was changed",
    );
    expect(responseText(forwardedSetupTimeout(add, true))).toContain(
      "Call ppal-connect to check",
    );
  });
});
