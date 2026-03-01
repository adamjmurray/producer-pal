// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { createContext } from "preact";
import { useContext } from "preact/hooks";

/**
 * Context providing a mapping from tool IDs to display names.
 * Default is an empty object (consumer falls back to raw tool ID).
 */
export const ToolNamesContext = createContext<Record<string, string>>({});

/**
 * Hook to access tool display names from context
 * @returns {Record<string, string>} Map of tool ID to display name
 */
export function useToolNames(): Record<string, string> {
  return useContext(ToolNamesContext);
}
