// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { VERSION } from "#src/shared/config.ts";
import { responseText } from "../../offline/tests/offline-add-producer-pal-test-helpers.ts";
import { answerUpdateCall, isUpdateCall } from "../update-call.ts";
import { fakeDevice, OLD, updateDeps } from "./update-test-helpers.ts";

describe("isUpdateCall", () => {
  it("is ppal-manage update-producer-pal when the portal offers ppal-manage", () => {
    expect(
      isUpdateCall("ppal-manage", { action: "update-producer-pal" }, true),
    ).toBe(true);
  });

  it.each([
    ["ppal-manage isn't offered", "ppal-manage", "update-producer-pal", false],
    ["another tool", "ppal-connect", "update-producer-pal", true],
    ["another action", "ppal-manage", "add-producer-pal", true],
    ["no action", "ppal-manage", undefined, true],
  ])("isn't one when %s", (_why, name, action, offered) => {
    expect(isUpdateCall(name, { action }, offered)).toBe(false);
  });
});

describe("answerUpdateCall", () => {
  it("runs the update with the User Library the call gives", async () => {
    const deps = updateDeps();
    const response = await answerUpdateCall(
      { action: "update-producer-pal", userLibrary: "/given" },
      fakeDevice(OLD, VERSION),
      deps,
    );

    expect(response.isError).toBeUndefined();
    expect(deps.installDevice).toHaveBeenCalledWith(
      "/given",
      expect.any(String),
    );
  });

  it("refuses a param the action doesn't read, before touching the device", async () => {
    const device = fakeDevice(OLD);
    const response = await answerUpdateCall(
      { action: "update-producer-pal", steps: 2 },
      device,
      updateDeps(),
    );

    expect(response.isError).toBe(true);
    expect(responseText(response)).toContain("steps");
    expect(device.connect).not.toHaveBeenCalled();
  });

  it("refuses a userLibrary that isn't a string", async () => {
    const response = await answerUpdateCall(
      { action: "update-producer-pal", userLibrary: 7 },
      fakeDevice(OLD),
      updateDeps(),
    );

    expect(responseText(response)).toBe("Error: userLibrary must be a string");
  });
});
