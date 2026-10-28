// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * How many bytes a string takes in UTF-8, which is what Max's message limit
 * counts. Hand-rolled because Max's V8 runtime isn't guaranteed a TextEncoder.
 * A lone surrogate counts as 3 bytes, like the U+FFFD an encoder writes for it.
 *
 * @param text - The string to measure
 * @returns Its size in UTF-8 bytes
 */
export function utf8ByteLength(text: string): number {
  let bytes = 0;

  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);

    if (unit < 0x80) {
      bytes += 1;
    } else if (unit < 0x800) {
      bytes += 2;
    } else if (
      isHighSurrogate(unit) &&
      isLowSurrogate(text.charCodeAt(i + 1))
    ) {
      bytes += 4;
      i++; // the pair is one character
    } else {
      bytes += 3;
    }
  }

  return bytes;
}

/**
 * @param unit - A UTF-16 code unit (NaN past the end of a string)
 * @returns Whether it is the first half of a surrogate pair
 */
export function isHighSurrogate(unit: number): boolean {
  return unit >= 0xd800 && unit <= 0xdbff;
}

/**
 * @param unit - A UTF-16 code unit (NaN past the end of a string)
 * @returns Whether it is the second half of a surrogate pair
 */
function isLowSurrogate(unit: number): boolean {
  return unit >= 0xdc00 && unit <= 0xdfff;
}
