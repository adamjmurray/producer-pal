// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  ExportIcon,
  ImportIcon,
} from "#webui/components/chat/controls/header/HeaderIcons";
import { ICON_BUTTON_CLASS } from "#webui/components/context/editor/context-buttons";

interface ContextIoButtonsProps {
  /** Open a file picker and import the chosen .md file. */
  onImport: () => void;
  /** Export the editor's current content to a .md file. */
  onExport: () => void;
}

/**
 * The Import/Export icon-button pair shared by the context and skills editors'
 * controls strips (sits alongside the size readout and Clear). Icons match the
 * conversation list's import/export affordances; each carries a tooltip +
 * aria-label since it has no visible text.
 * @param props - Button props
 * @returns The Import + Export buttons
 */
export function ContextIoButtons(
  props: ContextIoButtonsProps,
): preact.JSX.Element {
  const { onImport, onExport } = props;

  return (
    <>
      <button
        type="button"
        onClick={onImport}
        className={ICON_BUTTON_CLASS}
        aria-label="Import"
        title="Import from a .md file"
      >
        <ImportIcon />
      </button>
      <button
        type="button"
        onClick={onExport}
        className={ICON_BUTTON_CLASS}
        aria-label="Export"
        title="Export to a .md file"
      >
        <ExportIcon />
      </button>
    </>
  );
}
