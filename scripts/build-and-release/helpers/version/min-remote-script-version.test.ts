// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  raiseMinRemoteScriptVersion,
  shippedScriptChanges,
} from "./min-remote-script-version.ts";

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

describe("shippedScriptChanges", () => {
  it("drops the gen-UI files and keeps the rest", () => {
    expect(
      shippedScriptChanges([
        "remote-script/Producer_Pal/gen_ui_routes.py",
        "remote-script/Producer_Pal/ui_widgets.py",
        "remote-script/Producer_Pal/watches.py",
        "remote-script/Producer_Pal/routes.py",
      ]),
    ).toStrictEqual(["remote-script/Producer_Pal/routes.py"]);
  });

  it("leaves nothing when only gen-UI files changed, so no bump is due", () => {
    const changed = shippedScriptChanges([
      "remote-script/Producer_Pal/watches.py",
    ]);

    expect(raiseMinRemoteScriptVersion(FILE, "2.5.0-rc2", changed)).toBeNull();
  });
});
