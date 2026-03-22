// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Tests for run-id.ts
 */

import { describe, it, expect } from "vitest";
import { generateRunId } from "./run-id.ts";

describe("generateRunId", () => {
  it("returns a string matching the expected format", () => {
    const id = generateRunId();

    // Format: 2026-03-22T10-30-00Z (no colons, no milliseconds)
    expect(id).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z$/);
  });

  it("does not contain colons", () => {
    const id = generateRunId();

    expect(id).not.toContain(":");
  });

  it("does not contain milliseconds", () => {
    const id = generateRunId();

    expect(id).not.toContain(".");
  });
});
