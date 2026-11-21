// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { parseUninstallFlags } from "./uninstall-flags.ts";

describe("parseUninstallFlags", () => {
  it("reads each flag", () => {
    expect(
      parseUninstallFlags([
        "--device",
        "--other-copies",
        "--remote-script",
        "--plugin-host",
      ]),
    ).toStrictEqual({
      device: true,
      otherCopies: true,
      remoteScript: true,
      pluginHost: true,
    });
    expect(parseUninstallFlags(["--remote-script"])).toStrictEqual({
      device: false,
      otherCopies: false,
      remoteScript: true,
      pluginHost: false,
    });
    expect(parseUninstallFlags(["--plugin-host"])).toStrictEqual({
      device: false,
      otherCopies: false,
      remoteScript: false,
      pluginHost: true,
    });
  });

  it("refuses no target, --other-copies alone, and unknown flags", () => {
    expect(() => parseUninstallFlags([])).toThrow(/Say what to uninstall/);
    expect(() => parseUninstallFlags(["--other-copies"])).toThrow(
      /needs --device/,
    );
    expect(() => parseUninstallFlags(["--device", "--bogus"])).toThrow(
      /Usage: uninstall\.ts/,
    );
  });
});
