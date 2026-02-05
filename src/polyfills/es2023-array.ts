// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

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
 * @param arr - Array to splice
 * @param start - Start index
 * @param deleteCount - Number of elements to remove
 * @param items - Elements to insert
 * @returns New spliced array
 */
export function polyfillToSpliced<T>(
  arr: T[],
  start: number,
  deleteCount?: number,
  ...items: T[]
): T[] {
  const copy = [...arr];

  copy.splice(start, deleteCount ?? copy.length - start, ...items);

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
  const actualIndex = index < 0 ? copy.length + index : index;

  if (actualIndex < 0 || actualIndex >= copy.length) {
    throw new RangeError(`Invalid index: ${index}`);
  }

  copy[actualIndex] = value;

  return copy;
}

// Install polyfills on Array.prototype if methods don't exist
if (!Array.prototype.toSorted) {
  Array.prototype.toSorted = function <T>(
    this: T[],
    compareFn?: (a: T, b: T) => number,
  ): T[] {
    return polyfillToSorted(this, compareFn);
  };
}

if (!Array.prototype.toReversed) {
  Array.prototype.toReversed = function <T>(this: T[]): T[] {
    return polyfillToReversed(this);
  };
}

if (!Array.prototype.toSpliced) {
  Array.prototype.toSpliced = function <T>(
    this: T[],
    start: number,
    deleteCount?: number,
    ...items: T[]
  ): T[] {
    return polyfillToSpliced(this, start, deleteCount, ...items);
  };
}

if (!Array.prototype.with) {
  Array.prototype.with = function <T>(this: T[], index: number, value: T): T[] {
    return polyfillWith(this, index, value);
  };
}
