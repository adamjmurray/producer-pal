// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * One maker is spelled differently by Live's browser folder, its plug-in
 * database and an AU bundle's plist ("Acme Audio", "Acme"), so vendors are
 * compared loosely, here, wherever they are compared.
 */

/**
 * @param vendor - A vendor name
 * @returns The name in the form vendors are compared in; undefined for none
 */
export function foldVendor(
  vendor: string | null | undefined,
): string | undefined {
  return vendor?.trim().toLowerCase();
}

/**
 * @param a - A vendor name
 * @param b - Another
 * @returns Whether one starts with the other at a word boundary, case aside:
 *   "Acme Audio" and "Acme" do, "Acme" and "Acmetone" don't. Never true for a
 *   missing or empty name.
 */
export function sameVendor(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const foldedA = foldVendor(a);
  const foldedB = foldVendor(b);

  if (foldedA == null || foldedB == null || foldedA === "" || foldedB === "") {
    return false;
  }

  const [short, long] =
    foldedA.length <= foldedB.length ? [foldedA, foldedB] : [foldedB, foldedA];

  return (
    long.startsWith(short) &&
    (long.length === short.length ||
      /^[^\p{L}\p{N}]/u.test(long.slice(short.length)))
  );
}

/**
 * @param items - Things with a vendor
 * @param vendor - The vendor to find
 * @param vendorOf - How to read an item's vendor
 * @returns The items whose vendor is exactly this one (case and outer spaces
 *   aside); none when no vendor was given
 */
export function exactVendorMatches<T>(
  items: T[],
  vendor: string | null | undefined,
  vendorOf: (item: T) => string | null | undefined,
): T[] {
  const wanted = foldVendor(vendor);

  return items.filter((item) => foldVendor(vendorOf(item)) === wanted);
}

/**
 * @param items - Things with a vendor
 * @param vendor - The vendor to find
 * @param vendorOf - How to read an item's vendor
 * @returns The items whose vendor matches loosely (see sameVendor)
 */
export function looseVendorMatches<T>(
  items: T[],
  vendor: string | null | undefined,
  vendorOf: (item: T) => string | null | undefined,
): T[] {
  return items.filter((item) => sameVendor(vendorOf(item), vendor));
}

/**
 * Pick by vendor, exact first: with "Acme" and "Acme Audio" both there, a path
 * naming "Acme" means that one. Loose matches count only when none is exact.
 * @param items - Things with a vendor
 * @param vendor - The vendor to find
 * @param vendorOf - How to read an item's vendor
 * @returns The exact matches, else the loose ones, else none
 */
export function vendorMatches<T>(
  items: T[],
  vendor: string | null | undefined,
  vendorOf: (item: T) => string | null | undefined,
): T[] {
  const exact = exactVendorMatches(items, vendor, vendorOf);

  return exact.length > 0 ? exact : looseVendorMatches(items, vendor, vendorOf);
}
