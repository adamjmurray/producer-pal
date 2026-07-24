// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useState } from "preact/hooks";
import { type ChatPreset, type PresetFields } from "#webui/types/settings";
import { createPresetId, loadPresets, savePresets } from "./preset-storage";

/** Result of a create attempt: the new preset, or a reason it was rejected. */
export type CreatePresetResult =
  { ok: true; preset: ChatPreset } | { ok: false; error: string };

/** Browser-local preset collection: list + create/update/delete. */
export interface UsePresetsReturn {
  presets: ChatPreset[];
  createPreset: (
    name: string,
    fields: PresetFields,
    description?: string,
  ) => CreatePresetResult;
  updatePreset: (
    id: string,
    fields: PresetFields,
    description?: string,
  ) => void;
  deletePreset: (id: string) => void;
}

/**
 * Manage the user's named chat-settings presets, persisted to localStorage.
 * Mirrors the list/save/delete *surface* of the REST-backed collections
 * (use-doc-collection) but stays fully client-side and synchronous — presets
 * hold no server-side content and no API keys.
 * @returns The preset list plus create/update/delete actions
 */
export function usePresets(): UsePresetsReturn {
  const [presets, setPresets] = useState<ChatPreset[]>(loadPresets);

  const persist = useCallback((next: ChatPreset[]) => {
    setPresets(next);
    savePresets(next);
  }, []);

  const createPreset = useCallback(
    (
      name: string,
      fields: PresetFields,
      description?: string,
    ): CreatePresetResult => {
      const trimmed = name.trim();

      if (trimmed.length === 0) {
        return { ok: false, error: "Enter a name for the preset." };
      }

      if (presets.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) {
        return { ok: false, error: "A preset with that name already exists." };
      }

      const preset: ChatPreset = withDescription(
        { id: createPresetId(), name: trimmed, ...fields },
        description,
      );

      persist([...presets, preset]);

      return { ok: true, preset };
    },
    [presets, persist],
  );

  const updatePreset = useCallback(
    (id: string, fields: PresetFields, description?: string) => {
      persist(
        presets.map((p) =>
          p.id === id ? withDescription({ ...p, ...fields }, description) : p,
        ),
      );
    },
    [presets, persist],
  );

  const deletePreset = useCallback(
    (id: string) => {
      persist(presets.filter((p) => p.id !== id));
    },
    [presets, persist],
  );

  return { presets, createPreset, updatePreset, deletePreset };
}

/**
 * Return a copy of the preset with its description set from the given value:
 * trimmed and stored when non-empty, dropped when blank. A `undefined` value
 * leaves any existing description untouched (so an update that doesn't touch the
 * description — e.g. a bare "Update" re-capturing fields — preserves it).
 * @param preset - The preset to adjust
 * @param description - New description, "" to clear, or undefined to keep
 * @returns The preset with its description normalized
 */
function withDescription(preset: ChatPreset, description?: string): ChatPreset {
  if (description === undefined) return preset;

  const trimmed = description.trim();
  const next = { ...preset };

  if (trimmed) next.description = trimmed;
  else delete next.description;

  return next;
}
