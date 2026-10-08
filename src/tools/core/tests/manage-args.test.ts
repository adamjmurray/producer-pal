// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { checkManageArgs } from "../helpers/manage-args.ts";

describe("checkManageArgs", () => {
  it("passes the action and the params it reads", () => {
    expect(
      checkManageArgs({ action: "install-remote-script", userLibrary: "/x" }),
    ).toStrictEqual({
      action: "install-remote-script",
      userLibrary: "/x",
      steps: undefined,
    });
  });

  it("reads steps sent as text", () => {
    expect(checkManageArgs({ action: "undo", steps: "3" }).steps).toBe(3);
  });

  it("names the actions when none is given", () => {
    expect(() => checkManageArgs({})).toThrow(
      "action must be one of: install-remote-script, add-producer-pal, undo, redo",
    );
  });

  it("names the action it doesn't know", () => {
    expect(() => checkManageArgs({ action: "wipe" })).toThrow(
      'action must be one of: install-remote-script, add-producer-pal, undo, redo, not "wipe"',
    );
  });

  it("refuses userLibrary on undo", () => {
    expect(() =>
      checkManageArgs({ action: "undo", userLibrary: "/x" }),
    ).toThrow(/userLibrary/);
  });

  it("reads userLibrary for add-producer-pal", () => {
    expect(
      checkManageArgs({ action: "add-producer-pal", userLibrary: "/x" }),
    ).toStrictEqual({
      action: "add-producer-pal",
      userLibrary: "/x",
      steps: undefined,
    });
  });

  it("refuses steps on an install", () => {
    expect(() =>
      checkManageArgs({ action: "install-remote-script", steps: 2 }),
    ).toThrow(/steps/);
  });

  it.each([0, 51, 1.5, "many"])("refuses steps of %s", (steps) => {
    expect(() => checkManageArgs({ action: "redo", steps })).toThrow(
      /steps must be a whole number from 1 to 50/,
    );
  });
});
