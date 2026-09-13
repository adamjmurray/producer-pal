// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { filesContaining } from "#src/test/helpers/meta-test-helpers.ts";

// Every specialized device spec grew its own one-line property reader, and two
// of them were byte-identical. readNumberProp and readNumberByIndex replace
// both shapes.
const DEVICES = "src/tools/shared/device/specialized/devices";

/** A wrapper that only forwards to getProperty. */
const BARE_READER =
  /function read\w*\(device: LiveAPI\)[^{]*\{\s*return device\.getProperty\(/;

/** A static catalog indexed by a stored property. */
const CATALOG_READER =
  /const index = device\.getProperty\([^)]*\) as number;\s*\n\s*return [A-Z_]+\[index\]/;

describe("specialized device property reads have one home", () => {
  it("reads a number through readNumberProp", () => {
    expect(
      filesContaining(DEVICES, BARE_READER),
      "use readNumberProp from specialized-param-access.ts",
    ).toStrictEqual([]);
  });

  it("reads a catalog value through readNumberByIndex", () => {
    expect(
      filesContaining(DEVICES, CATALOG_READER),
      "use readNumberByIndex from specialized-param-access.ts",
    ).toStrictEqual([]);
  });
});
