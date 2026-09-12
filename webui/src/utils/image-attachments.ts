// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ChatImage } from "#webui/chat/sdk/types";

/** The image types every provider we support can read. */
const IMAGE_MEDIA_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
];

/** `accept` filter for the attach button's file input. */
export const IMAGE_ACCEPT = IMAGE_MEDIA_TYPES.join(",");

/** Largest image (bytes) that can be attached to a message. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Most images one message may carry. */
export const MAX_IMAGES_PER_MESSAGE = 10;

/** Rejection notice for a file that isn't a supported image type. */
export const NOT_AN_IMAGE_MESSAGE = "Only PNG, JPEG, GIF and WebP images";

/** Rejection notice for an image over {@link MAX_IMAGE_BYTES}. */
export const IMAGE_TOO_LARGE_MESSAGE = `Image too large (max ${MAX_IMAGE_BYTES / (1024 * 1024)} MB)`;

/** Rejection notice once {@link MAX_IMAGES_PER_MESSAGE} are attached. */
export const TOO_MANY_IMAGES_MESSAGE = `At most ${MAX_IMAGES_PER_MESSAGE} images per message`;

/** Rejection notice for an image the browser couldn't read. */
export const IMAGE_READ_ERROR_MESSAGE = "Couldn't read that image";

/** The attachments after a paste/drop/pick, and why anything was left out. */
export interface AttachImagesResult {
  images: ChatImage[];
  /** The first rejection, or null when everything was attached. */
  notice: string | null;
}

/**
 * Add files to the current attachments, reading each accepted one to base64.
 * A rejection comes back as a notice rather than an exception, so one bad file
 * in a multi-file drop doesn't lose the good ones.
 * @param current - Images already attached, kept in order
 * @param files - The dropped, pasted, or picked files
 * @returns The new attachment list and the first rejection notice
 */
export async function attachImages(
  current: ChatImage[],
  files: File[],
): Promise<AttachImagesResult> {
  const room = MAX_IMAGES_PER_MESSAGE - current.length;
  const accepted: File[] = [];
  let notice: string | null = null;

  for (const file of files) {
    const rejection = rejectionFor(file, accepted.length < room);

    if (rejection == null) {
      accepted.push(file);
    } else {
      notice ??= rejection;
    }
  }

  const images = [...current];

  for (const image of await Promise.all(accepted.map(readImage))) {
    if (image == null) {
      notice ??= IMAGE_READ_ERROR_MESSAGE;
    } else {
      images.push(image);
    }
  }

  return { images, notice };
}

/**
 * Keep only the image files from a paste or drop. Anything else (text, a
 * non-image file) is left for the editor to handle.
 * @param files - The event's file list
 * @returns The image files, in order
 */
export function imageFilesFrom(files: FileList | null | undefined): File[] {
  return [...(files ?? [])].filter((file) => file.type.startsWith("image/"));
}

/**
 * The `src` for rendering an attachment.
 * @param image - The attached image
 * @returns A data URL
 */
export function imageDataUrl(image: ChatImage): string {
  return `data:${image.mediaType};base64,${image.data}`;
}

// --- Helpers below main exports ---

/**
 * Why a file can't be attached, or null when it can.
 * @param file - The candidate file
 * @param hasRoom - Whether the per-message cap still has room
 * @returns The rejection notice, or null
 */
function rejectionFor(file: File, hasRoom: boolean): string | null {
  if (!IMAGE_MEDIA_TYPES.includes(file.type)) {
    return NOT_AN_IMAGE_MESSAGE;
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return IMAGE_TOO_LARGE_MESSAGE;
  }

  if (!hasRoom) {
    return TOO_MANY_IMAGES_MESSAGE;
  }

  return null;
}

/**
 * Read one image file to base64, without the `data:` URL prefix.
 * @param file - An accepted image file
 * @returns The attachment, or null when the read failed
 */
function readImage(file: File): Promise<ChatImage | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onerror = () => resolve(null);

    reader.onload = () => {
      const url = typeof reader.result === "string" ? reader.result : "";
      const data = url.slice(url.indexOf(",") + 1);

      resolve(data === "" ? null : { mediaType: file.type, data });
    };

    reader.readAsDataURL(file);
  });
}
