// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type ListPluginsArgs, type PluginItem } from "../../library-types.ts";

/**
 * Apply the list-plugins filters (name/vendor substring, format, category,
 * subcategory). Substring matches are case-insensitive.
 *
 * A plug-in with no category or subcategories (not in Live's DB) can't match a
 * category or subcategory filter. It is left out, and counted when nothing else
 * ruled it out, so the caller can say so.
 *
 * @param plugins - Candidate plug-ins
 * @param args - Filter parameters
 * @returns The matches, and how many plug-ins with an unknown category the
 *   category or subcategory filter alone left out
 */
export function filterPlugins(
  plugins: PluginItem[],
  args: ListPluginsArgs,
): { matches: PluginItem[]; unknownCategoryLeftOut: number } {
  const candidates = plugins.filter((item) => matchesBasicFilters(item, args));
  const matches = candidates.filter((item) => matchesKindFilters(item, args));
  const unknownCategoryLeftOut = candidates.filter(
    (item) =>
      item.category == null &&
      item.subcategories.length === 0 &&
      !matchesKindFilters(item, args),
  ).length;

  return { matches, unknownCategoryLeftOut };
}

/**
 * @param item - Candidate plug-in
 * @param args - Filter parameters
 * @returns true if the item passes the name, vendor and format filters
 */
function matchesBasicFilters(item: PluginItem, args: ListPluginsArgs): boolean {
  if (args.query && !includesIgnoreCase(item.name, args.query)) {
    return false;
  }

  if (args.vendor && !includesIgnoreCase(item.vendor ?? "", args.vendor)) {
    return false;
  }

  return !args.format || item.format === args.format;
}

/**
 * @param item - Candidate plug-in
 * @param args - Filter parameters
 * @returns true if the item passes the category and subcategory filters
 */
function matchesKindFilters(item: PluginItem, args: ListPluginsArgs): boolean {
  if (args.category && item.category !== args.category) {
    return false;
  }

  const subFilter = args.subcategory;

  return (
    !subFilter ||
    item.subcategories.some((sub) => includesIgnoreCase(sub, subFilter))
  );
}

/**
 * Case-insensitive substring test.
 *
 * @param haystack - String to search within
 * @param needle - Substring to look for
 * @returns true if haystack contains needle (ignoring case)
 */
function includesIgnoreCase(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}
