// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useState } from "preact/hooks";

/** Which preset the Presets tab is pointed at, owned above the tab. */
export interface PresetSelection {
  /** The selected preset's id, or "" for none. */
  selectedId: string;
  /** Point at another preset (or "" to clear). */
  setSelectedId: (id: string) => void;
  /** The live copy of the selected preset's description field. */
  editDescription: string;
  /** Update the description draft. */
  setEditDescription: (value: string) => void;
}

/**
 * Hold the Presets tab's selection OUTSIDE the tab.
 *
 * The settings dialog unmounts the inactive tab, so state kept inside the
 * preset controls is gone the moment the user leaves to change a setting the
 * preset covers — which is most of the reason to leave. Coming back to an empty
 * picker, the only way to reach Update is to pick the preset again, and that
 * applies it first, discarding the very edit the user went to make.
 *
 * @returns The selection state and its setters
 */
export function usePresetSelection(): PresetSelection {
  const [selectedId, setSelectedId] = useState<string>("");
  const [editDescription, setEditDescription] = useState<string>("");

  return { selectedId, setSelectedId, editDescription, setEditDescription };
}
