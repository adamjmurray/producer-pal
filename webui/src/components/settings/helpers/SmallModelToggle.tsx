// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { Tooltip } from "#webui/components/settings/controls/Tooltip";

interface SmallModelToggleProps {
  smallModelMode: boolean;
  setSmallModelMode: (enabled: boolean) => void;
}

/**
 * Small model mode checkbox with emoji indicator and tooltip
 * @param props - Component props
 * @param props.smallModelMode - Whether small model mode is enabled
 * @param props.setSmallModelMode - Small model mode setter callback
 * @returns Small model toggle element
 */
export function SmallModelToggle({
  smallModelMode,
  setSmallModelMode,
}: SmallModelToggleProps) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <span className={smallModelMode ? "" : "text-xl"}>
        {smallModelMode ? "🐢" : "🐘"}
      </span>{" "}
      <input
        type="checkbox"
        id="smallModelMode"
        checked={smallModelMode}
        onChange={(e) =>
          setSmallModelMode((e.target as HTMLInputElement).checked)
        }
      />
      Small model mode
      <Tooltip text="Simplifies skills and tool parameters for less capable models. Recommended for local models (Ollama and Bionic)." />
    </label>
  );
}
