// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// What V8 and Node share about ppal-manage: the actions, the Node routes V8
// calls, and what they answer. The undo result is the remote script's own JSON,
// so its fields stay snake_case.

import { type RouteReply } from "#src/tools/shared/remote-script/remote-script-route-contract.ts";

export const MANAGE_ACTIONS = [
  "install-producer-pal",
  "add-producer-pal",
  "update-producer-pal",
  "undo",
  "redo",
] as const;

export type ManageAction = (typeof MANAGE_ACTIONS)[number];

/**
 * Retired action names that still work, mapped to the action they mean. A
 * connector and a device can be different versions, so one may still send or
 * advertise a name the other has retired. The schema doesn't publish these.
 */
export const MANAGE_ACTION_ALIASES = {
  "install-remote-script": "install-producer-pal",
} as const satisfies Record<string, ManageAction>;

/**
 * @param action - The action as sent
 * @returns The action it means: a retired name becomes its replacement, and
 *   anything else comes back as it was
 */
export function canonicalManageAction(action: unknown): unknown {
  return typeof action === "string" &&
    Object.keys(MANAGE_ACTION_ALIASES).includes(action)
    ? MANAGE_ACTION_ALIASES[action as keyof typeof MANAGE_ACTION_ALIASES]
    : action;
}

/** The actions that step through Live's undo history. */
export type HistoryAction = "undo" | "redo";

/** The most steps one undo or redo call takes. */
export const MAX_STEPS = 50;

/** The Node routes V8 calls for ppal-manage. */
export const MANAGE_ROUTES = {
  install: "manage.installProducerPal",
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
 * What became of one file the install puts in the User Library.
 * - `installed`: it wasn't there. `updated`: replaced an older copy.
 * - `current`: already the same. `kept`: a newer or different copy was left.
 * - `ok: false`: couldn't be installed; `detail` says why and what it left.
 */
export type InstallPart =
  | {
      ok?: undefined;
      status: "installed" | "updated" | "current" | "kept";
      path: string;
      version?: string;
      detail?: string;
    }
  | { ok: false; path?: string; detail: string };

/**
 * What the install route answers. `error` is worded for the model and says what
 * state the install was left in. `ran: false` means neither file was tried.
 */
export type InstallReply =
  | { ran: false; error: string }
  | { ran: true; remoteScript: InstallPart; device: InstallPart };

/** What an install tells the caller, and what is left for the user to do. */
export interface ManageInstallResult {
  remoteScript: InstallPart;
  device: InstallPart;
  nextSteps: string;
}

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
