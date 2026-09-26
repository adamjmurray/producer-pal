// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_TOOL_STEPS,
  MAX_TOOL_STEPS_LIMIT,
  MIN_TOOL_STEPS,
} from "#webui/chat/sdk/step-budget";
import {
  loadEnabledTools,
  loadMaxToolSteps,
  loadSubagentPresetId,
  saveMaxToolSteps,
  saveSubagentPresetId,
} from "#webui/hooks/settings/helpers/chat-settings-storage";

describe("chat-settings-storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("loadEnabledTools", () => {
    it("returns empty object for invalid JSON in saved data", () => {
      localStorage.setItem("producer_pal_enabled_tools", "not-json");

      expect(loadEnabledTools()).toStrictEqual({});
    });
  });

  describe("subagent preset persistence", () => {
    it("returns null when nothing is stored (inherit)", () => {
      expect(loadSubagentPresetId()).toBeNull();
    });

    it("round-trips a preset id through localStorage", () => {
      saveSubagentPresetId("preset-abc");
      expect(loadSubagentPresetId()).toBe("preset-abc");
    });

    it("clears the stored id when saving null (back to inherit)", () => {
      saveSubagentPresetId("preset-abc");
      saveSubagentPresetId(null);

      expect(loadSubagentPresetId()).toBeNull();
      expect(localStorage.getItem("producer_pal_subagent_preset")).toBeNull();
    });
  });

  describe("tool-step budget persistence", () => {
    it("returns the shipped default when nothing is stored", () => {
      expect(loadMaxToolSteps()).toBe(DEFAULT_MAX_TOOL_STEPS);
    });

    it("round-trips a budget through localStorage", () => {
      saveMaxToolSteps(40);
      expect(loadMaxToolSteps()).toBe(40);
    });

    it.each([
      ["below the floor", MIN_TOOL_STEPS - 1],
      ["above the ceiling", MAX_TOOL_STEPS_LIMIT + 1],
      ["fractional", 12.5],
    ])("clears the key rather than storing a %s value", (_label, steps) => {
      saveMaxToolSteps(40);
      saveMaxToolSteps(steps);

      expect(loadMaxToolSteps()).toBe(DEFAULT_MAX_TOOL_STEPS);
      expect(localStorage.getItem("producer_pal_max_tool_steps")).toBeNull();
    });

    it.each([
      ["garbage", "not-a-number"],
      ["out of range", "5000"],
      ["empty", ""],
    ])("falls back to the default on a %s stored value", (_label, raw) => {
      // A hand-edited localStorage must not strand a turn at one step or let it
      // run away — the load path re-validates rather than trusting the save.
      localStorage.setItem("producer_pal_max_tool_steps", raw);

      expect(loadMaxToolSteps()).toBe(DEFAULT_MAX_TOOL_STEPS);
    });
  });
});
