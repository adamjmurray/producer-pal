// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useRef } from "preact/hooks";
import { IMAGE_ACCEPT } from "#webui/utils/image-attachments";

interface AttachImagesButtonProps {
  disabled: boolean;
  onFiles: (files: File[]) => void;
}

/**
 * Opens a file picker for images and hands the chosen files to the composer.
 * The input itself stays hidden — the button is the control.
 * @param props - Disabled state and the handler for picked files
 * @returns The attach button (and its hidden file input)
 */
export function AttachImagesButton(
  props: AttachImagesButtonProps,
): preact.JSX.Element {
  const { disabled, onFiles } = props;
  const inputRef = useRef<HTMLInputElement>(null);

  const pickFiles = (event: Event) => {
    const picker = event.currentTarget as HTMLInputElement;

    onFiles([...(picker.files ?? [])]);
    // Clear it, or picking the same file twice in a row fires no change event.
    picker.value = "";
  };

  return (
    <>
      <button
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        aria-label="Attach images"
        title="Attach images"
        className="rounded-lg border border-zinc-300 px-4 py-1 text-sm hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:hover:bg-zinc-700"
      >
        📎
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        multiple
        className="hidden"
        data-testid="image-file-input"
        onChange={pickFiles}
      />
    </>
  );
}
