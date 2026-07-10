// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { vi } from "vitest";
import {
  type DocCollectionStatus,
  type UseDocCollectionReturn,
} from "#webui/hooks/context/use-doc-collection";

/**
 * Build a fake collection-hook return in the given status, with idle save state
 * and no-op save/delete/refresh spies. The kit is generic, so the memory and
 * custom-skills screen tests share this one builder.
 * @param status - The collection status to expose
 * @param over - Fields to override on the default (idle, no-op) return
 * @returns A UseDocCollectionReturn stub
 */
export function fakeDocCollection<TView, TInput>(
  status: DocCollectionStatus<TView>,
  over: Partial<UseDocCollectionReturn<TView, TInput>> = {},
): UseDocCollectionReturn<TView, TInput> {
  return {
    status,
    saveStatus: "idle",
    saveError: null,
    saveEntry: vi.fn().mockResolvedValue(null),
    renameEntry: vi.fn().mockResolvedValue(null),
    deleteEntry: vi.fn().mockResolvedValue(true),
    refresh: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}
