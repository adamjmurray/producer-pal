// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  auComponentDirs,
  readAuComponents,
} from "../../../query/plugins/read-au-components.ts";

describe("readAuComponents", () => {
  let dir: string;

  /**
   * @param bundle - Bundle folder name
   * @param info - Info.plist text, or null for no Info.plist
   */
  function addBundle(bundle: string, info: string | null): void {
    const contents = join(dir, bundle, "Contents");

    mkdirSync(contents, { recursive: true });

    if (info != null) {
      writeFileSync(join(contents, "Info.plist"), info);
    }
  }

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "ppal-au-components-"));
    addBundle(
      "Many.component",
      `<plist><dict><key>AudioComponents</key><array>
        <dict><key>name</key><string>Xfer &amp; Co: Serum 2: Lite</string><key>type</key><string>aumu</string>
          <key>resourceUsage</key><dict><key>network.client</key><true/></dict></dict>
        <dict><key>name</key><string>Plain</string><key>type</key><string>aufx</string></dict>
        <dict><key>name</key><string>No type</string></dict>
        <dict><key>type</key><string>aufx</string></dict>
        <string>not a dict</string>
      </array></dict></plist>`,
    );
    addBundle("NoComponents.component", "<plist><dict/></plist>");
    addBundle("NotADict.component", "<plist><array/></plist>");
    addBundle("Binary.component", "bplist00");
    addBundle("NoPlist.component", null);
    addBundle("Other.vst3", "<plist><dict/></plist>");
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("lists each AU in each readable bundle, splitting the vendor at the first colon", async () => {
    const bundle = join(dir, "Many.component");

    expect(await readAuComponents([dir, join(dir, "missing")])).toStrictEqual([
      { name: "Serum 2: Lite", vendor: "Xfer & Co", type: "aumu", bundle },
      { name: "Plain", vendor: null, type: "aufx", bundle },
    ]);
  });

  it("looks in the system's AU folders by default", () => {
    expect(auComponentDirs()).toStrictEqual([
      "/Library/Audio/Plug-Ins/Components",
      expect.stringMatching(/Library\/Audio\/Plug-Ins\/Components$/),
      "/System/Library/Components",
    ]);
  });
});
