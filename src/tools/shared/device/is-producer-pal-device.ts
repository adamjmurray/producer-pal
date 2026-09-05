// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Whether an object is the Producer Pal device, or a rack/chain holding it.
 *
 * Deleting, moving or duplicating it breaks the connection the model is talking
 * through, so every write path that could must refuse instead.
 *
 * The check is path-based, so it also covers a rack or chain the device sits
 * inside. It does NOT cover a drum pad: a pad's path (`... drum_pads N`) is not
 * a prefix of its chain's devices, so clearing the pad is still possible.
 * @param object - The object about to be deleted, moved or duplicated
 * @returns True when the operation would take the Producer Pal device with it
 */
export function isProducerPalDevice(object: LiveAPI): boolean {
  const hostPath = producerPalDevicePath();

  if (hostPath == null) return false;

  const path = object.path;

  return path === hostPath || hostPath.startsWith(`${path} `);
}

/**
 * The path of the Producer Pal device itself.
 * @returns The path, or null when the device can't be reached
 */
function producerPalDevicePath(): string | null {
  try {
    return LiveAPI.from("this_device").path || null;
  } catch {
    return null;
  }
}
