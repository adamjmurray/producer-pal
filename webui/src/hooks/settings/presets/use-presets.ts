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
  createPreset: (name: string, fields: PresetFields) => CreatePresetResult;
  updatePreset: (id: string, fields: PresetFields) => void;
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
    (name: string, fields: PresetFields): CreatePresetResult => {
      const trimmed = name.trim();

      if (trimmed.length === 0) {
        return { ok: false, error: "Enter a name for the preset." };
      }

      if (presets.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) {
        return { ok: false, error: "A preset with that name already exists." };
      }

      const preset: ChatPreset = {
        id: createPresetId(),
        name: trimmed,
        ...fields,
      };

      persist([...presets, preset]);

      return { ok: true, preset };
    },
    [presets, persist],
  );

  const updatePreset = useCallback(
    (id: string, fields: PresetFields) => {
      persist(presets.map((p) => (p.id === id ? { ...p, ...fields } : p)));
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
