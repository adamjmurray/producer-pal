// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { processThoughtText } from "./thought-processing.ts";

describe("processThoughtText", () => {
  describe("entering thought mode", () => {
    it("starts thought block when entering thought mode", () => {
      const result = processThoughtText("thinking...", true, false);

      expect(result.inThought).toBe(true);
      expect(result.output).toContain("<THOUGHT>");
      expect(result.output).toContain("thinking...");
      expect(result.text).toBeUndefined();
    });

    it("formats thought content with header box", () => {
      const result = processThoughtText("thinking...", true, false);

      expect(result.output).toContain("╔");
    });
  });

  describe("continuing thought mode", () => {
    it("continues thought block when already in thought", () => {
      const result = processThoughtText("more thinking", true, true);

      expect(result.inThought).toBe(true);
      expect(result.output).not.toContain("<THOUGHT>");
      expect(result.output).toContain("more thinking");
      expect(result.text).toBeUndefined();
    });
  });

  describe("exiting thought mode", () => {
    it("ends thought and outputs text when exiting thought", () => {
      const result = processThoughtText("response", false, true);

      expect(result.inThought).toBe(false);
      expect(result.output).toContain("<end_thought>");
      expect(result.output).toContain("╚");
      expect(result.output).toContain("response");
      expect(result.text).toBe("response");
    });
  });

  describe("normal text output", () => {
    it("outputs text directly when not in thought", () => {
      const result = processThoughtText("response", false, false);

      expect(result.inThought).toBe(false);
      expect(result.output).toBe("response");
      expect(result.text).toBe("response");
    });

    it("does not include thought markers for normal text", () => {
      const result = processThoughtText("hello world", false, false);

      expect(result.output).not.toContain("╔");
      expect(result.output).not.toContain("╚");
      expect(result.output).not.toContain("<THOUGHT>");
      expect(result.output).not.toContain("<end_thought>");
    });
  });

  describe("edge cases", () => {
    it("handles empty string text", () => {
      const result = processThoughtText("", false, false);

      expect(result.inThought).toBe(false);
      expect(result.output).toBe("");
      expect(result.text).toBe("");
    });

    it("handles multiline thought content", () => {
      const result = processThoughtText("line1\nline2", true, true);

      expect(result.inThought).toBe(true);
      expect(result.output).toContain("line1\nline2");
    });
  });
});
