// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type SkillSlotView } from "#webui/hooks/context/use-skill-overrides";

/**
 * Build a slot view with overridable fields.
 * @param over - Fields to override on the default slot
 * @returns A slot view
 */
export function slot(over: Partial<SkillSlotView> = {}): SkillSlotView {
  return {
    name: "barbeat-standard",
    title: "Core (standard)",
    description: "Slot description.",
    builtIn: "BUILT-IN",
    override: "",
    enabled: true,
    canDisable: true,
    gate: null,
    drifted: false,
    splitStale: null,
    forkedFromVersion: null,
    ...over,
  };
}
