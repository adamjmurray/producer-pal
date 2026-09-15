// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useState } from "preact/hooks";
import { type UIImagePart, type UIPart } from "#webui/types/messages";
import { imageDataUrl } from "#webui/utils/image-attachments";

interface UserImagesProps {
  parts: UIPart[];
}

/**
 * Images a user message carried, as thumbnails above its text. Clicking one
 * toggles it to full width so a screenshot can be read, then back.
 * @param props - The message's UI parts (non-image parts are ignored)
 * @returns The thumbnail row, or null when the message has no images
 */
export function UserImages(props: UserImagesProps): preact.JSX.Element | null {
  const { parts } = props;
  const [expanded, setExpanded] = useState<number | null>(null);
  const images = parts.filter(
    (part): part is UIImagePart => part.type === "image",
  );

  if (images.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2 py-1" data-testid="user-images">
      {images.map((image, index) => {
        const isExpanded = expanded === index;

        return (
          <button
            key={index}
            onClick={() => setExpanded(isExpanded ? null : index)}
            aria-label={
              isExpanded
                ? `Shrink image ${index + 1}`
                : `Expand image ${index + 1}`
            }
            className={isExpanded ? "w-full" : ""}
          >
            <img
              src={imageDataUrl(image)}
              alt={`Attached image ${index + 1}`}
              className={`rounded ${isExpanded ? "w-full" : "max-h-40"}`}
            />
          </button>
        );
      })}
    </div>
  );
}
