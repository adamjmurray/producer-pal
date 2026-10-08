// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// What V8 and Node share about ppal-manage: the actions, the Node routes V8
// calls, and what they answer. The undo result is the remote script's own JSON,
// so its fields stay snake_case.

import { type RouteReply } from "#src/tools/shared/remote-script/remote-script-route-contract.ts";

export const MANAGE_ACTIONS = [
  "install-remote-script",
  "undo",
  "redo",
] as const;

export type ManageAction = (typeof MANAGE_ACTIONS)[number];

/** The actions that step through Live's undo history. */
export type HistoryAction = "undo" | "redo";

/** The most steps one undo or redo call takes. */
export const MAX_STEPS = 50;

/** The Node routes V8 calls for ppal-manage. */
export const MANAGE_ROUTES = {
  install: "manage.installRemoteScript",
  undo: "remoteScript.undo.undo",
  redo: "remoteScript.undo.redo",
} as const;

/**
 * How long V8 waits for an install, which may look up the User Library first.
 * Node's own limit for the route is longer, so V8 gives up first.
 */
export const INSTALL_WAIT_MS = 20_000;
export const INSTALL_ROUTE_TIMEOUT_MS = 25_000;

export interface InstallRequest {
  /** Absolute path to the User Library; absent means find it */
  userLibrary?: string;
}

/**
 * What the install route answers. `error` is worded for the model and says what
 * state the install was left in.
 */
export type InstallReply =
  | { installed: true; version: string; path: string }
  | { installed: false; error: string };

/**
 * What the remote script reports after undoing or redoing: how many steps it
 * took, why it took fewer than asked, and what Live can undo and redo now.
 */
export interface HistoryResult {
  done: number;
  stopped?: string;
  can_undo: boolean;
  can_redo: boolean;
}

export type HistoryReply = RouteReply<HistoryResult>;
