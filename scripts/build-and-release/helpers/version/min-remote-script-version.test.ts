// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { raiseMinRemoteScriptVersion } from "./min-remote-script-version.ts";

const FILE =
  '/** doc */\nexport const MIN_REMOTE_SCRIPT_VERSION = "2.5.0-rc1";\n';
const CHANGED = ["remote-script/Producer_Pal/routes.py"];

describe("raiseMinRemoteScriptVersion", () => {
  it("raises the minimum when the remote script changed", () => {
    expect(raiseMinRemoteScriptVersion(FILE, "2.5.0-rc2", CHANGED)).toBe(
      '/** doc */\nexport const MIN_REMOTE_SCRIPT_VERSION = "2.5.0-rc2";\n',
    );
  });

  it("leaves it when the remote script didn't change", () => {
    expect(raiseMinRemoteScriptVersion(FILE, "2.5.0-rc2", [])).toBeNull();
  });

  it("leaves it when it is already the new version", () => {
    expect(raiseMinRemoteScriptVersion(FILE, "2.5.0-rc1", CHANGED)).toBeNull();
  });

  it("throws when the constant can't be found", () => {
    expect(() =>
      raiseMinRemoteScriptVersion("export const MIN = 1;\n", "2.5.0", CHANGED),
    ).toThrow("No version line to update");
  });
});
