// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ChatImage } from "#webui/chat/sdk/types";
import { AttachedImage } from "./AttachedImage";

interface ImageAttachmentsProps {
  images: ChatImage[];
  /** Why the last paste/drop/pick left something out, or null. */
  notice: string | null;
  /** True while an added image is still being read. */
  loading: boolean;
  onRemove: (index: number) => void;
}

/**
 * The composer's pending attachments: a thumbnail per image with a remove
 * button, plus a loading note and any rejection notice. Nothing to show,
 * nothing rendered.
 * @param props - Attachments, the notice, loading state, and remove handler
 * @returns The thumbnail strip, or null
 */
export function ImageAttachments(
  props: ImageAttachmentsProps,
): preact.JSX.Element | null {
  const { images, notice, loading, onRemove } = props;

  if (images.length === 0 && notice == null && !loading) {
    return null;
  }

  return (
    <div
      className="mb-2 flex flex-wrap items-center gap-2"
      data-testid="image-attachments"
    >
      {images.map((image, index) => (
        <div key={index} className="relative">
          <AttachedImage
            image={image}
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
      {loading && (
        <span
          role="status"
          className="text-xs text-zinc-500 dark:text-zinc-400"
        >
          Adding image…
        </span>
      )}
      {notice != null && (
        <span role="alert" className="text-xs text-red-600 dark:text-red-400">
          {notice}
        </span>
      )}
    </div>
  );
}
