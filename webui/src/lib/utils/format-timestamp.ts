// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Formats a Unix timestamp for display in title attribute.
 * Uses locale-aware formatting for user's timezone.
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Locale-formatted date/time string
 */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

/**
 * Formats the date portion of a timestamp in short locale format (e.g., "3/3/26").
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Short date string
 */
export function formatTimestampDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    dateStyle: "short",
  });
}

/**
 * Formats the time portion of a timestamp in short locale format (e.g., "2:15 PM").
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Short time string
 */
export function formatTimestampTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    timeStyle: "short",
  });
}
