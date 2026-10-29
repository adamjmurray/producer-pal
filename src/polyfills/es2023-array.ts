// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * ES2023 "change array by copy" polyfills for Max v8 object.
 * Max v8 supports ES2022 + partial ES2023 but lacks these methods.
 * Only loaded in live-api-adapter bundle (Node for Max has native support).
 */

/* eslint-disable @typescript-eslint/no-unnecessary-condition -- polyfill guards */

/**
 * Polyfill implementation for Array.prototype.toSorted.
 * @param arr - Array to sort
 * @param compareFn - Optional comparison function
 * @returns New sorted array
 */
export function polyfillToSorted<T>(
  arr: T[],
  compareFn?: (a: T, b: T) => number,
): T[] {
  return [...arr].sort(compareFn);
}

/**
 * Polyfill implementation for Array.prototype.toReversed.
 * @param arr - Array to reverse
 * @returns New reversed array
 */
export function polyfillToReversed<T>(arr: T[]): T[] {
  return [...arr].reverse();
}

/**
 * Polyfill implementation for Array.prototype.toSpliced.
 *
 * Reads the argument count like native does: with only `start` it deletes to
 * the end, but an explicit undefined `deleteCount` deletes nothing.
 * @param arr - Array to splice
 * @param args - Start index, then the number to remove, then the items to insert
 * @returns New spliced array
 */
export function polyfillToSpliced<T>(arr: T[], ...args: unknown[]): T[] {
  const copy = [...arr];

  // splice() with no arguments deletes nothing, and so does the native method
  copy.splice(...(args as [number, number, ...T[]]));

  return copy;
}

/**
 * Polyfill implementation for Array.prototype.with.
 * @param arr - Array to modify
 * @param index - Index to replace (supports negative)
 * @param value - New value
 * @returns New array with replaced element
 */
export function polyfillWith<T>(arr: T[], index: number, value: T): T[] {
  const copy = [...arr];
  // Match native Array.prototype.with, which converts the index with
  // ToIntegerOrInfinity: truncate toward zero (1.9 -> 1) and map NaN/undefined
  // to 0. Without this a fractional index writes a non-index "1.9" property and
  // a NaN index slips past the range guards (NaN < 0 and NaN >= length are both
  // false), silently no-opping instead of replacing index 0.
  const truncated = Math.trunc(index) || 0;
  const actualIndex = truncated < 0 ? copy.length + truncated : truncated;

  if (actualIndex < 0 || actualIndex >= copy.length) {
    throw new RangeError(`Invalid index: ${index}`);
  }

  copy[actualIndex] = value;

  return copy;
}

/**
 * Install a method the way native ones are: non-enumerable, so it doesn't show
 * up in `for...in` over an array.
 * @param name - The method name
 * @param value - The method
 */
function install(name: string, value: unknown): void {
  Object.defineProperty(Array.prototype, name, {
    value,
    writable: true,
    enumerable: false,
    configurable: true,
  });
}

// Install polyfills on Array.prototype if methods don't exist
if (!Array.prototype.toSorted) {
  install("toSorted", function <
    T,
  >(this: T[], compareFn?: (a: T, b: T) => number): T[] {
    return polyfillToSorted(this, compareFn);
  });
}

if (!Array.prototype.toReversed) {
  install("toReversed", function <T>(this: T[]): T[] {
    return polyfillToReversed(this);
  });
}

if (!Array.prototype.toSpliced) {
  install("toSpliced", function <T>(this: T[], ...args: unknown[]): T[] {
    return polyfillToSpliced(this, ...args);
  });
}

if (!Array.prototype.with) {
  install("with", function <T>(this: T[], index: number, value: T): T[] {
    return polyfillWith(this, index, value);
  });
}
