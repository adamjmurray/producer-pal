// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/preact";
import { beforeEach, describe, expect, it } from "vitest";
import { loadPresets } from "#webui/hooks/settings/presets/preset-storage";
import {
  type CreatePresetResult,
  usePresets,
} from "#webui/hooks/settings/presets/use-presets";
import { type PresetFields } from "#webui/types/settings";

const fields: PresetFields = {
  provider: "anthropic",
  model: "claude",
  thinking: "Default",
  smallModelMode: false,
};

/**
 * Assert a create succeeded and return the created preset's id.
 * @param result - The create result to unwrap
 * @returns The new preset id
 */
function expectCreatedId(result: CreatePresetResult | undefined): string {
  if (!result?.ok) {
    throw new Error("expected a successful create");
  }

  return result.preset.id;
}

describe("usePresets", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("creates a preset and persists it", async () => {
    const { result } = renderHook(() => usePresets());
    let created: CreatePresetResult | undefined;

    await act(() => {
      created = result.current.createPreset("My Preset", fields);
    });

    expect(created?.ok).toBe(true);
    expect(result.current.presets).toHaveLength(1);
    expect(result.current.presets[0]).toMatchObject({
      name: "My Preset",
      ...fields,
    });
    expect(loadPresets()).toHaveLength(1);
  });

  it("rejects blank and duplicate (case-insensitive) names", async () => {
    const { result } = renderHook(() => usePresets());

    let blank: CreatePresetResult | undefined;

    await act(() => {
      blank = result.current.createPreset("   ", fields);
    });
    expect(blank).toStrictEqual({ ok: false, error: expect.any(String) });

    await act(() => {
      result.current.createPreset("Dup", fields);
    });
    let dup: CreatePresetResult | undefined;

    await act(() => {
      dup = result.current.createPreset("dup", fields);
    });
    expect(dup?.ok).toBe(false);
    expect(result.current.presets).toHaveLength(1);
  });

  it("updates a preset's fields while keeping its id", async () => {
    const { result } = renderHook(() => usePresets());
    let id = "";

    await act(() => {
      id = expectCreatedId(result.current.createPreset("P", fields));
    });

    await act(() => {
      result.current.updatePreset(id, { ...fields, model: "new-model" });
    });

    expect(result.current.presets[0]?.id).toBe(id);
    expect(result.current.presets[0]?.model).toBe("new-model");
    expect(loadPresets()[0]?.model).toBe("new-model");
  });

  it("stores a trimmed description and the captured toolset", async () => {
    const { result } = renderHook(() => usePresets());

    await act(() => {
      result.current.createPreset(
        "Worker",
        { ...fields, enabledTools: { "ppal-delete": false } },
        "  cheap bulk editor  ",
      );
    });

    expect(result.current.presets[0]).toMatchObject({
      description: "cheap bulk editor",
      enabledTools: { "ppal-delete": false },
    });
  });

  it("preserves the description on a bare update, clears it on blank", async () => {
    const { result } = renderHook(() => usePresets());
    let id = "";

    await act(() => {
      id = expectCreatedId(result.current.createPreset("P", fields, "keep me"));
    });

    // No description arg => existing description is preserved.
    await act(() => {
      result.current.updatePreset(id, { ...fields, model: "m2" });
    });
    expect(result.current.presets[0]?.description).toBe("keep me");

    // Blank description => the field is dropped.
    await act(() => {
      result.current.updatePreset(id, fields, "   ");
    });
    expect(result.current.presets[0]).not.toHaveProperty("description");
  });

  it("deletes a preset", async () => {
    const { result } = renderHook(() => usePresets());
    let id = "";

    await act(() => {
      id = expectCreatedId(result.current.createPreset("P", fields));
    });

    await act(() => {
      result.current.deletePreset(id);
    });

    expect(result.current.presets).toHaveLength(0);
    expect(loadPresets()).toHaveLength(0);
  });
});
