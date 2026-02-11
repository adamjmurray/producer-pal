// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { buildInstructions } from "./basic.ts";

describe("buildInstructions", () => {
  it("includes basic instructions without project notes", () => {
    const context = {};
    const result = buildInstructions(context);

    expect(result).toContain("Summarize the Live Set");
    expect(result).toContain("Say the messagesForUser");
    expect(result).toContain("Ask what they'd like to create");
    expect(result).not.toContain("project memory");
  });

  it("includes memory summary when content exists", () => {
    const context = {
      memory: {
        enabled: true,
        content: "This is a test project",
        writable: false,
      },
    };
    const result = buildInstructions(context);

    expect(result).toContain("Summarize the Live Set");
    expect(result).toContain("Summarize the project memory");
    expect(result).not.toContain("update the memory");
  });

  it("mentions memory is writable when applicable", () => {
    const context = {
      memory: {
        enabled: true,
        content: "This is a test project",
        writable: true,
      },
    };
    const result = buildInstructions(context);

    expect(result).toContain("Summarize the project memory");
    expect(result).toContain("update the memory");
  });

  it("excludes memory section when content is empty", () => {
    const context = {
      memory: {
        enabled: true,
        content: "",
        writable: true,
      },
    };
    const result = buildInstructions(context);

    expect(result).not.toContain("project memory");
  });

  it("excludes memory section when content is null", () => {
    // Test null content handling (runtime value may be null despite type)
    const context = {
      memory: {
        enabled: true,
        content: null as unknown as string,
        writable: true,
      },
    };
    const result = buildInstructions(context);

    expect(result).not.toContain("project memory");
  });

  it("formats output with bullet points", () => {
    const context = {};
    const result = buildInstructions(context);

    expect(result).toMatch(/\*/);
    expect(result.split("\n").length).toBeGreaterThan(1);
  });
});
