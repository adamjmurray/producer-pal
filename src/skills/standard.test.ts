// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, describe, expect, it, vi } from "vitest";

describe("skills - ENABLE_CODE_EXEC", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("includes code transforms skills when ENABLE_CODE_EXEC is true", async () => {
    vi.stubEnv("ENABLE_CODE_EXEC", "true");

    const { skills } = await import("./standard.ts");

    expect(skills).toContain("Code Transforms");
  });

  it("excludes code transforms skills when ENABLE_CODE_EXEC is not set", async () => {
    vi.stubEnv("ENABLE_CODE_EXEC", "");

    const { skills } = await import("./standard.ts");

    expect(skills).not.toContain("Code Transforms");
  });
});
