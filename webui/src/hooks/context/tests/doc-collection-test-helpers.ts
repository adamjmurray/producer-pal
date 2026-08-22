// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { act } from "@testing-library/preact";
import { expect, vi } from "vitest";
import {
  type DocCollectionStatus,
  type UseDocCollectionReturn,
} from "#webui/hooks/context/use-doc-collection";
import {
  deferred,
  jsonResponse,
} from "#webui/hooks/context/tests/doc-transport-test-helpers";

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
    renameEntry: vi.fn().mockResolvedValue({ entry: null, error: null }),
    deleteEntry: vi.fn().mockResolvedValue(true),
    resetSaveStatus: vi.fn(),
    refresh: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

/** The save-indicator slice every collection hook exposes. */
interface SaveIndicator {
  current: {
    resetSaveStatus: () => void;
    saveStatus: string;
    saveError: string | null;
  };
}

/**
 * Reset the save indicator and assert it went back to idle with no error.
 * @param result - The rendered collection hook
 */
export async function expectResetToIdle(result: SaveIndicator): Promise<void> {
  await act(async () => {
    result.current.resetSaveStatus();
  });

  expect(result.current.saveStatus).toBe("idle");
  expect(result.current.saveError).toBeNull();
}

/**
 * Race a save against a refresh and land them out of order: the save's echo
 * first, then the refresh's GET, which read the collection BEFORE the save. The
 * overlap guard has to drop that stale read rather than paint it.
 * @param fetchMock - The suite's fetch mock, queued save-then-refresh
 * @param ops - How to dispatch the save and the refresh
 * @param echoes - The save's response body, then the stale GET's
 */
export async function landSaveBeforeStaleRefresh(
  fetchMock: ReturnType<typeof vi.fn>,
  ops: { save: () => Promise<unknown>; refresh: () => Promise<unknown> },
  echoes: { saved: unknown; stale: unknown },
): Promise<void> {
  const putEcho = deferred<Response>();
  const staleGet = deferred<Response>();

  fetchMock.mockReturnValueOnce(putEcho.promise); // save PUT
  fetchMock.mockReturnValueOnce(staleGet.promise); // refresh GET (pre-save read)

  await act(async () => {
    const savePromise = ops.save();
    const refreshPromise = ops.refresh();

    putEcho.resolve(jsonResponse(echoes.saved));
    await savePromise;

    staleGet.resolve(jsonResponse(echoes.stale));
    await refreshPromise;
  });
}
