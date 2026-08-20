// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/** One entry from an `info` listing's children section. */
export interface ChildInfo {
  /** The LOM class of the child, as `info` names it. */
  type: string;
  /** True for `children` (an indexed list), false for a single `child`. */
  list: boolean;
}

/** What `info` says one LOM class exposes. Recorded once per class, not per object. */
export interface TypeInfo {
  children: Record<string, ChildInfo>;
  /** Property name to the LOM type name `info` gives it. */
  properties: Record<string, string>;
  functions: string[];
}

export interface DumpedObject {
  id: string;
  type: string;
  /**
   * Which `types` entry describes this object, when its class name alone does
   * not. Live reports "View" for Song.View, Track.View and Device.View alike,
   * and they expose different properties.
   */
  typeKey?: string;
  /** Raw `get()` results by property name; null where the read failed. */
  properties: Record<string, unknown>;
}

export interface DumpMeta {
  generator: string;
  liveVersion: string | null;
  roots: string[];
  objects: number;
  aliases: number;
  types: number;
  /** Reads that failed even when retried alone, and are recorded as null. */
  failedReads: number;
  redactedValues: number;
  requests: number;
  /** True when the walk stopped at --max-objects with a frontier still queued. */
  truncated: boolean;
  skippedChildren: string[];
}

export interface LiveSetDump {
  meta: DumpMeta;
  types: Record<string, TypeInfo>;
  /** Path to object, keyed the way a tool would build the path. */
  objects: Record<string, DumpedObject>;
  /** A second path that resolves to an object already recorded, to its path. */
  aliases: Record<string, string>;
}

export interface WalkOptions {
  roots: string[];
  /** Recorded in the dump's meta; the walk itself does not use it. */
  liveVersion: string | null;
  /** Child names never traversed, e.g. `parameters` on a big instrument. */
  skipChildren: Set<string>;
  maxObjects: number;
  redactPaths: boolean;
  log: (message: string) => void;
}
