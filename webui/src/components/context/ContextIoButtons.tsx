// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

interface ContextIoButtonsProps {
  /** Open a file picker and import the chosen .md file. */
  onImport: () => void;
  /** Export the editor's current content to a .md file. */
  onExport: () => void;
}

/** Shared class for the small text-button actions in the controls strips. */
const IO_BUTTON_CLASS =
  "shrink-0 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors";

/**
 * The Import/Export text-button pair shared by the context and skills editors'
 * controls strips (sits alongside Clear / Reset to default).
 * @param props - Button props
 * @returns The Import + Export buttons
 */
export function ContextIoButtons(
  props: ContextIoButtonsProps,
): preact.JSX.Element {
  const { onImport, onExport } = props;

  return (
    <>
      <button type="button" onClick={onImport} className={IO_BUTTON_CLASS}>
        Import
      </button>
      <button type="button" onClick={onExport} className={IO_BUTTON_CLASS}>
        Export
      </button>
    </>
  );
}
