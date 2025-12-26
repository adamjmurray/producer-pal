import { describe, expect, it } from "vitest";
import {
  SYSTEM_INSTRUCTION,
  getModelName,
  getThinkingBudget,
  toolNames,
} from "./config";

describe("config", () => {
  describe("SYSTEM_INSTRUCTION", () => {
    it("is a non-empty string", () => {
      expect(typeof SYSTEM_INSTRUCTION).toBe("string");
      expect(SYSTEM_INSTRUCTION.length).toBeGreaterThan(0);
    });

    it("contains key concepts", () => {
      expect(SYSTEM_INSTRUCTION).toContain("Producer Pal");
      expect(SYSTEM_INSTRUCTION).toContain("Ableton Live");
    });
  });

  describe("getModelName", () => {
    it("returns display name for gemini-2.5-pro", () => {
      expect(getModelName("gemini-2.5-pro")).toBe("Gemini 2.5 Pro");
    });

    it("returns display name for gemini-2.5-flash", () => {
      expect(getModelName("gemini-2.5-flash")).toBe("Gemini 2.5 Flash");
    });

    it("returns display name for gemini-2.5-flash-lite", () => {
      expect(getModelName("gemini-2.5-flash-lite")).toBe(
        "Gemini 2.5 Flash-Lite",
      );
    });

    it("returns the modelId unchanged for unknown models", () => {
      expect(getModelName("unknown-model")).toBe("unknown-model");
      expect(getModelName("gemini-1.5-pro")).toBe("gemini-1.5-pro");
    });
  });

  describe("getThinkingBudget", () => {
    it("returns 0 for Off level", () => {
      expect(getThinkingBudget("Off")).toBe(0);
    });

    it("returns 2048 for Low level", () => {
      expect(getThinkingBudget("Low")).toBe(2048);
    });

    it("returns 4096 for Medium level", () => {
      expect(getThinkingBudget("Medium")).toBe(4096);
    });

    it("returns 8192 for High level", () => {
      expect(getThinkingBudget("High")).toBe(8192);
    });

    it("returns 16384 for Ultra level", () => {
      expect(getThinkingBudget("Ultra")).toBe(16384);
    });

    it("returns -1 for Auto level", () => {
      expect(getThinkingBudget("Default")).toBe(-1);
    });

    it("returns -1 (Auto) for unknown levels", () => {
      expect(getThinkingBudget("Unknown")).toBe(-1);
      expect(getThinkingBudget("VeryHigh")).toBe(-1);
    });
  });

  describe("toolNames", () => {
    it("is an object", () => {
      expect(typeof toolNames).toBe("object");
      expect(toolNames).not.toBeNull();
    });

    it("contains expected tool mappings", () => {
      expect(toolNames["ppal-connect"]).toBe("Connect to Ableton");
      expect(toolNames["ppal-read-live-set"]).toBe("Read Live Set");
      expect(toolNames["ppal-update-live-set"]).toBe("Update Live Set");
      expect(toolNames["ppal-create-track"]).toBe("Create Track");
      expect(toolNames["ppal-read-track"]).toBe("Read Track");
      expect(toolNames["ppal-update-track"]).toBe("Update Track");
      expect(toolNames["ppal-create-scene"]).toBe("Create Scene");
      expect(toolNames["ppal-read-scene"]).toBe("Read Scene");
      expect(toolNames["ppal-update-scene"]).toBe("Update Scene");
      expect(toolNames["ppal-create-clip"]).toBe("Create Clip");
      expect(toolNames["ppal-read-clip"]).toBe("Read Clip");
      expect(toolNames["ppal-update-clip"]).toBe("Update Clip");
      expect(toolNames["ppal-playback"]).toBe("Playback Controls");
      expect(toolNames["ppal-delete"]).toBe("Delete Track/Scene/Clip");
      expect(toolNames["ppal-duplicate"]).toBe("Duplicate Track/Scene/Clip");
      expect(toolNames["ppal-memory"]).toBe("Project Notes");
    });

    it("has 16 tool mappings", () => {
      expect(Object.keys(toolNames).length).toBe(16);
    });
  });
});
