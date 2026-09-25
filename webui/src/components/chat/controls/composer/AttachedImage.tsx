// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useMemo } from "preact/hooks";
import { type ChatImage } from "#webui/chat/sdk/types";
import { imageDataUrl } from "#webui/utils/image-attachments";

interface AttachedImageProps {
  image: ChatImage;
  alt: string;
  className: string;
}

/**
 * An attached image. Its `data:` URL is built once: a fresh string for a
 * multi-MB image makes Preact compare `src` byte by byte on every render.
 * @param props - The image, its alt text, and its classes
 * @returns The image element
 */
export function AttachedImage(props: AttachedImageProps): preact.JSX.Element {
  const { image, alt, className } = props;
  const { mediaType, data } = image;
  const src = useMemo(
    () => imageDataUrl({ mediaType, data }),
    [mediaType, data],
  );

  return <img src={src} alt={alt} className={className} />;
}
