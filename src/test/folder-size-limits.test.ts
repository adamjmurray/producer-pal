// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import path from "node:path";
import {
  assertFolderSizeLimit,
  projectRoot,
} from "./helpers/meta-test-helpers.ts";

const MAX_ITEMS_PER_FOLDER = 12;

describe("Folder size limits", () => {
  it.each([
    ["src/", "src"],
    ["webui/src/", "webui/src"],
    ["scripts/", "scripts"],
    ["evals/", "evals"],
    ["e2e/", "e2e"],
  ])("should enforce max 13 items per folder in %s", (_name, relativePath) => {
    const dirPath = path.join(projectRoot, relativePath);

    assertFolderSizeLimit(dirPath, MAX_ITEMS_PER_FOLDER, expect);
    expect(true).toBe(true); // Satisfy vitest/expect-expect rule
  });
});
