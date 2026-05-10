// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import * as console from "#src/shared/v8-max-console.ts";
import { readSamples } from "./read-samples.ts";

export interface MemoryResult {
  enabled: boolean;
  writable?: boolean;
  content?: string;
}

interface LibrarySample {
  path: string;
  name: string;
  useCount: number;
}

export interface SamplesResult {
  sampleFolder: string;
  samples: string[];
  librarySamples?: LibrarySample[];
  libraryAvailable?: boolean;
}

interface LibrarySearchResponse {
  source: "live-db";
  dbAvailable: boolean;
  samples: LibrarySample[];
  reason?: string;
}

/** Result limit for the DB-backed library search */
const LIBRARY_SEARCH_LIMIT = 100;

/**
 * Handle read action
 * @param context - The context object
 * @returns Memory result with enabled status and content
 */
export function handleReadMemory(
  context: Partial<ToolContext> = {},
): MemoryResult {
  const memory = context.memory;

  if (!memory?.enabled) {
    return { enabled: false };
  }

  return {
    enabled: true,
    writable: memory.writable,
    content: memory.content,
  };
}

/**
 * Handle write action
 * @param content - Memory content to write
 * @param context - The context object
 * @returns Memory result with updated content
 */
export function handleWriteMemory(
  content: string | undefined,
  context: Partial<ToolContext> = {},
): MemoryResult {
  const memory = context.memory;

  if (!memory?.enabled) {
    throw new Error("Project context is disabled");
  }

  if (!memory.writable) {
    throw new Error(
      "AI updates are disabled - enable 'Allow AI updates' in settings to let AI modify project context",
    );
  }

  if (!content) {
    throw new Error("Content required for write action");
  }

  memory.content = content;

  // Send update to Max patch via outlet
  outlet(0, "update_memory", content);

  return {
    enabled: true,
    writable: memory.writable,
    content: memory.content,
  };
}

/**
 * Handle search action: scan the configured sample folder (when set) and
 * additionally query Live's browser DB. DB results that duplicate folder
 * scan results (same absolute path) are filtered out.
 *
 * The sample folder is no longer required: when it isn't configured, the
 * folder scan is skipped and we return DB-sourced samples only.
 *
 * @param search - Optional search filter
 * @param context - The context object
 * @returns Samples result merging folder scan + DB results
 */
export async function handleSearchSamples(
  search: string | undefined,
  context: Partial<ToolContext> = {},
): Promise<SamplesResult> {
  const folderResult = context.sampleFolder
    ? readSamples({ search }, context)
    : { sampleFolder: "", samples: [] };

  const libraryResponse = await requestNode<LibrarySearchResponse>(
    "library.searchSamples",
    { query: search, limit: LIBRARY_SEARCH_LIMIT },
  );

  if (!libraryResponse.success || !libraryResponse.result) {
    console.warn(
      `library.searchSamples failed: ${libraryResponse.error ?? "unknown error"}`,
    );

    return {
      ...folderResult,
      libraryAvailable: false,
      librarySamples: [],
    };
  }

  const libraryResult = libraryResponse.result;
  // NOTE: the folder→absolute join below assumes POSIX-style paths and will
  // mis-dedupe on Windows where the folder uses backslashes but DB rows use
  // forward slashes. Windows is currently out of scope (AJM-326); revisit
  // when the Live DB integration is officially Windows-supported.
  const folderAbsolutePaths = new Set(
    folderResult.sampleFolder
      ? folderResult.samples.map((rel) => `${folderResult.sampleFolder}${rel}`)
      : [],
  );
  const dedupedLibrarySamples = libraryResult.samples.filter(
    (s) => !folderAbsolutePaths.has(s.path),
  );

  return {
    ...folderResult,
    libraryAvailable: libraryResult.dbAvailable,
    librarySamples: dedupedLibrarySamples,
  };
}
