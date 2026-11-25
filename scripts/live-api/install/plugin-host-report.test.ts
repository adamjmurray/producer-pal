// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { describePluginHostInstall } from "./plugin-host-report.ts";

const EFFECT = "PPal Plug-in Effect.amxd";

describe("describePluginHostInstall", () => {
  it("prints one line per wrapper", () => {
    const { lines, ok } = describePluginHostInstall([
      { name: "e", fileName: EFFECT, path: "/a", outcome: "installed" },
      { name: "i", fileName: "i.amxd", path: "/b", outcome: "current" },
    ]);

    expect(lines).toStrictEqual(["installed: /a", "already current: /b"]);
    expect(ok).toBe(true);
  });

  it("notes that an open Set keeps the old wrapper after an update", () => {
    const { lines } = describePluginHostInstall([
      { name: "e", fileName: EFFECT, path: "/a", outcome: "updated" },
    ]);

    expect(lines).toStrictEqual([
      "updated: /a",
      "A Set that's already open keeps the old wrapper until it's reopened.",
    ]);
  });

  it("is not ok when a wrapper failed, and says why", () => {
    const { lines, ok } = describePluginHostInstall([
      {
        name: "e",
        fileName: EFFECT,
        path: "/a",
        outcome: "failed",
        error: "EACCES",
        inUse: false,
      },
    ]);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(
      /^failed: \/a \(Couldn't install the wrapper \(EACCES\)/,
    );
    expect(ok).toBe(false);
  });
});
