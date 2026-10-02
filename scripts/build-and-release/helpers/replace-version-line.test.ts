// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { replaceVersionLine } from "./replace-version-line.ts";

const PATTERN = /^VERSION = ".*"$/m;

describe("replaceVersionLine", () => {
  it("replaces the version line", () => {
    expect(
      replaceVersionLine(
        '# header\nVERSION = "1.0.0"\n',
        PATTERN,
        'VERSION = "2.0.0"',
        "version.py",
      ),
    ).toBe('# header\nVERSION = "2.0.0"\n');
  });

  it("throws when the pattern matches nothing", () => {
    expect(() =>
      replaceVersionLine(
        "# someone renamed it\nversion = '1.0.0'\n",
        PATTERN,
        'VERSION = "2.0.0"',
        "version.py",
      ),
    ).toThrow("No version line to update in version.py");
  });

  it("throws when the version is already the new one", () => {
    expect(() =>
      replaceVersionLine(
        'VERSION = "2.0.0"\n',
        PATTERN,
        'VERSION = "2.0.0"',
        "version.py",
      ),
    ).toThrow("No version line to update");
  });
});
