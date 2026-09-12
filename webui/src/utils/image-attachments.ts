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

/** What a browser encodes to when it can't encode the type we asked for. */
const PNG_MEDIA_TYPE = "image/png";

/** Redrawing a GIF drops its animation, so GIFs are never scaled. */
const UNSCALABLE_MEDIA_TYPE = "image/gif";

/** Quality for a re-encoded JPEG or WebP. */
const ENCODE_QUALITY = 0.9;

/** `accept` filter for the attach button's file input. */
export const IMAGE_ACCEPT = IMAGE_MEDIA_TYPES.join(",");

/** Largest image (bytes) that can be attached, measured after scaling. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Longest side (px) an image is scaled down to before it's attached. */
export const MAX_IMAGE_DIMENSION = 1568;

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

/** A decoded image, ready to draw on a canvas. */
interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  /** Frees the bitmap; the `<img>` fallback has nothing to free. */
  close?: () => void;
}

/**
 * Add files to the current attachments, scaling each accepted one down when
 * it's oversized and reading it to base64. A rejection comes back as a notice
 * rather than an exception, so one bad file in a multi-file drop doesn't lose
 * the good ones.
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

  for (const prepared of await Promise.all(accepted.map(prepareImage))) {
    if (typeof prepared === "string") {
      notice ??= prepared;
    } else {
      images.push(prepared);
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
 * Why a file can't be attached, or null when it can. The size cap is not
 * checked here: it applies to what scaling produces, not to the file.
 * @param file - The candidate file
 * @param hasRoom - Whether the per-message cap still has room
 * @returns The rejection notice, or null
 */
function rejectionFor(file: File, hasRoom: boolean): string | null {
  if (!IMAGE_MEDIA_TYPES.includes(file.type)) {
    return NOT_AN_IMAGE_MESSAGE;
  }

  if (!hasRoom) {
    return TOO_MANY_IMAGES_MESSAGE;
  }

  return null;
}

/**
 * Scale one file down when it's oversized, then read it to base64.
 * @param file - An accepted image file
 * @returns The attachment, or the notice saying why it couldn't be attached
 */
async function prepareImage(file: File): Promise<ChatImage | string> {
  const blob = await scaleImageDown(file);

  if (blob == null) {
    return IMAGE_READ_ERROR_MESSAGE;
  }

  if (blob.size > MAX_IMAGE_BYTES) {
    return IMAGE_TOO_LARGE_MESSAGE;
  }

  return (await readImage(blob)) ?? IMAGE_READ_ERROR_MESSAGE;
}

/**
 * Redraw an image so its longest side is at most {@link MAX_IMAGE_DIMENSION}.
 * @param file - An accepted image file
 * @returns The re-encoded image, the file itself when it needs no scaling, or
 *   null when the browser couldn't decode it
 */
async function scaleImageDown(file: File): Promise<Blob | null> {
  if (file.type === UNSCALABLE_MEDIA_TYPE) {
    return file;
  }

  const decoded = await decodeImage(file);

  if (decoded == null) {
    return null;
  }

  const longest = Math.max(decoded.width, decoded.height);
  const blob =
    longest > MAX_IMAGE_DIMENSION ? await drawScaled(decoded, file.type) : file;

  decoded.close?.();

  return blob;
}

/**
 * Decode a file to something drawable.
 * @param file - An accepted image file
 * @returns The decoded image, or null when the browser couldn't decode it
 */
async function decodeImage(file: File): Promise<DecodedImage | null> {
  if (typeof createImageBitmap !== "function") {
    return await decodeWithImageElement(file);
  }

  try {
    const bitmap = await createImageBitmap(file);

    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  } catch {
    return null;
  }
}

/**
 * Decode with an `<img>`, for browsers without `createImageBitmap`.
 * @param file - An accepted image file
 * @returns The decoded image, or null when the browser couldn't decode it
 */
function decodeWithImageElement(file: File): Promise<DecodedImage | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };

    image.src = url;
  });
}

/**
 * Draw a decoded image scaled down, and re-encode it as the same type.
 * @param decoded - The decoded image
 * @param mediaType - The type to encode as
 * @returns The re-encoded image, or null when the canvas couldn't encode it
 */
async function drawScaled(
  decoded: DecodedImage,
  mediaType: string,
): Promise<Blob | null> {
  const scale = MAX_IMAGE_DIMENSION / Math.max(decoded.width, decoded.height);
  const canvas = document.createElement("canvas");

  canvas.width = Math.max(1, Math.round(decoded.width * scale));
  canvas.height = Math.max(1, Math.round(decoded.height * scale));

  const context = canvas.getContext("2d");

  if (context == null) {
    return null;
  }

  context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);

  // A browser that can't encode this type gives back PNG, or nothing at all.
  return (
    (await canvasToBlob(canvas, mediaType)) ??
    (await canvasToBlob(canvas, PNG_MEDIA_TYPE))
  );
}

/**
 * Promise wrapper for `canvas.toBlob`.
 * @param canvas - The canvas holding the scaled image
 * @param mediaType - The type to encode as
 * @returns The encoded image, or null when the browser couldn't encode it
 */
function canvasToBlob(
  canvas: HTMLCanvasElement,
  mediaType: string,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, mediaType, ENCODE_QUALITY);
  });
}

/**
 * Read an image to base64, without the `data:` URL prefix.
 * @param blob - The file, or the scaled-down version of it
 * @returns The attachment, or null when the read failed
 */
function readImage(blob: Blob): Promise<ChatImage | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onerror = () => resolve(null);

    reader.onload = () => {
      const url = typeof reader.result === "string" ? reader.result : "";
      const data = url.slice(url.indexOf(",") + 1);

      resolve(data === "" ? null : { mediaType: blob.type, data });
    };

    reader.readAsDataURL(blob);
  });
}
