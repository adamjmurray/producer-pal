// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * A mistake in the transform text that is the same in every meter: the call is
 * refused up front, before any clip is touched.
 */
export class TransformArgError extends Error {
  override name = "TransformArgError";
}

/**
 * A constant argument that is bad in this clip's meter only, because its value
 * uses a note value or bar length combined with other terms (`1bar - 4`). The
 * same text can be fine in another clip, so it fails per clip, never the call.
 */
export class MeterDependentArgError extends Error {
  override name = "MeterDependentArgError";
}
