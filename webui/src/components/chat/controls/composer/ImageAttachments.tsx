// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ChatImage } from "#webui/chat/sdk/types";
import { imageDataUrl } from "#webui/utils/image-attachments";

interface ImageAttachmentsProps {
  images: ChatImage[];
  /** Why the last paste/drop/pick left something out, or null. */
  notice: string | null;
  onRemove: (index: number) => void;
}

/**
 * The composer's pending attachments: a thumbnail per image with a remove
 * button, plus any rejection notice. Nothing to show, nothing rendered.
 * @param props - Attachments, the notice, and the remove handler
 * @returns The thumbnail strip, or null
 */
export function ImageAttachments(
  props: ImageAttachmentsProps,
): preact.JSX.Element | null {
  const { images, notice, onRemove } = props;

  if (images.length === 0 && notice == null) {
    return null;
  }

  return (
    <div
      className="mb-2 flex flex-wrap items-center gap-2"
      data-testid="image-attachments"
    >
      {images.map((image, index) => (
        <div key={index} className="relative">
          <img
            src={imageDataUrl(image)}
            alt={`Attachment ${index + 1}`}
            className="h-16 w-16 rounded border border-zinc-300 object-cover dark:border-zinc-600"
          />
          <button
            onClick={() => onRemove(index)}
            aria-label={`Remove attachment ${index + 1}`}
            className="absolute -top-1.5 -right-1.5 rounded-full bg-zinc-700 px-1 text-xs leading-none text-white hover:bg-zinc-900 dark:bg-zinc-500 dark:hover:bg-zinc-300 dark:hover:text-black"
          >
            ✕
          </button>
        </div>
      ))}
      {notice != null && (
        <span role="alert" className="text-xs text-red-600 dark:text-red-400">
          {notice}
        </span>
      )}
    </div>
  );
}
