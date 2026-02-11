// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { readSamples } from "#src/tools/samples/read-samples.ts";
import { connect } from "./connect.ts";

interface LiveSetInfo {
  name?: unknown;
  trackCount: number;
  sceneCount: number;
  tempo: unknown;
  timeSignature: string | null;
  scale?: string;
}

export interface ConnectResult {
  connected: boolean;
  producerPalVersion: string;
  abletonLiveVersion: string;
  liveSet: LiveSetInfo;
  $skills?: string;
  $instructions?: string;
  messagesForUser?: string;
  projectNotes?: string;
}

export interface NotesResult {
  enabled: boolean;
  writable?: boolean;
  content?: string;
}

export interface SamplesResult {
  sampleFolder: string;
  samples: string[];
}

/**
 * Handle connect action by delegating to existing connect() function
 * @param context - The context object
 * @returns Connection result with Live Set info
 */
export function handleConnect(
  context: Partial<ToolContext> = {},
): ConnectResult {
  return connect({}, context);
}

/**
 * Handle read-notes action
 * @param context - The context object
 * @returns Notes result with enabled status and content
 */
export function handleReadNotes(
  context: Partial<ToolContext> = {},
): NotesResult {
  const projectNotes = context.projectNotes;

  if (!projectNotes?.enabled) {
    return { enabled: false };
  }

  return {
    enabled: true,
    writable: projectNotes.writable,
    content: projectNotes.content,
  };
}

/**
 * Handle write-notes action
 * @param content - Notes content to write
 * @param context - The context object
 * @returns Notes result with updated content
 */
export function handleWriteNotes(
  content: string | undefined,
  context: Partial<ToolContext> = {},
): NotesResult {
  const projectNotes = context.projectNotes;

  if (!projectNotes?.enabled) {
    throw new Error("Project context is disabled");
  }

  if (!projectNotes.writable) {
    throw new Error(
      "AI updates are disabled - enable 'Allow AI updates' in settings to let AI modify project context",
    );
  }

  if (!content) {
    throw new Error("Content required for write action");
  }

  projectNotes.content = content;

  // Send update to Max patch via outlet
  outlet(0, "updatenotes", content);

  return {
    enabled: true,
    writable: projectNotes.writable,
    content: projectNotes.content,
  };
}

/**
 * Handle search-samples action by delegating to existing readSamples() function
 * @param search - Optional search filter
 * @param context - The context object
 * @returns Samples result with sample folder and file list
 */
export function handleSearchSamples(
  search: string | undefined,
  context: Partial<ToolContext> = {},
): SamplesResult {
  return readSamples({ search }, context);
}
