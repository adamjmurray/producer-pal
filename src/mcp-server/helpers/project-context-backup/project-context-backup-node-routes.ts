// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The `projectContext.sync` V8 → Node RPC route. V8 checks the current Live Set
// on every tool call (file_path isn't observable, so we pull rather than get
// notified) and calls this route when something might have changed. The route
// owns the filesystem side of the on-disk backup: restore the sidecar into an
// empty param after a device upgrade, or back the param up when it changed or
// the sidecar is missing. See dev/Memory-System.md for the design.

import { registerNodeRoute } from "../../rpc/node-request-protocol.ts";
import {
  deleteProjectContextSidecar,
  readProjectContextSidecar,
  writeProjectContextSidecar,
} from "./project-context-backup-store.ts";

/** What V8 sends: where the Live Set is, and the device's current blob. */
export interface ProjectContextSyncArgs {
  /** Absolute path to the Live Set (.als), or null when the set is unsaved. */
  filePath: string | null;
  /** The device param's current project-context blob ("" when empty). */
  content: string;
  /**
   * Whether an empty param may be restored from the sidecar. Only true on the
   * first sync of a session (a device (re)load — the one way an upgrade wipes
   * the param). After that, an empty param is a deliberate user clear, so we
   * propagate the clear instead of resurrecting the backup.
   */
  allowRestore: boolean;
}

/** What the route did, echoed back so V8 can apply a restore to the param. */
export interface ProjectContextSyncResult {
  action: "restore" | "backup" | "clear" | "none";
  /** The restored blob — present only when action === "restore". */
  content?: string;
}

/** Node-side collaborators the route needs beyond the filesystem. */
export interface ProjectContextBackupDeps {
  /**
   * Update Node's mirror of the project-context blob on a restore, so a restore
   * during ppal-connect is reflected in the connect response's injected context
   * block (which reads the mirror). The V8 side separately re-persists the blob
   * into the device param via the update_project_context outlet.
   */
  setProjectContext: (content: string) => void;
}

/**
 * Register the `projectContext.sync` route. Call once at startup.
 *
 * @param deps - Node-side collaborators (the project-context mirror setter)
 */
export function registerProjectContextBackupNodeRoutes(
  deps: ProjectContextBackupDeps,
): void {
  registerNodeRoute("projectContext.sync", (args) => syncRoute(args, deps));
}

// --- Helpers below main export ---

/**
 * Reconcile the device param against the on-disk sidecar for one Live Set.
 *
 * @param args - The sync args from V8 ({ filePath, content })
 * @param deps - Node-side collaborators (the project-context mirror setter)
 * @returns What happened, with the restored blob when action is "restore"
 */
function syncRoute(
  args: unknown,
  deps: ProjectContextBackupDeps,
): ProjectContextSyncResult {
  const { filePath, content, allowRestore } = (args ??
    {}) as Partial<ProjectContextSyncArgs>;

  // An unsaved set has no sidecar location — nothing to do until it's saved.
  if (typeof filePath !== "string" || filePath.length === 0) {
    return { action: "none" };
  }

  const currentContent = typeof content === "string" ? content : "";

  if (currentContent.trim() !== "") {
    return backupIfStale(filePath, currentContent);
  }

  // Empty param. On the first sync of a session it may be an upgrade-wiped
  // device (restore); otherwise it's a deliberate clear (propagate to disk).
  return allowRestore
    ? restoreIfBackupExists(filePath, deps)
    : clearBackupIfPresent(filePath);
}

/**
 * Param is empty (e.g. a freshly upgraded device): restore from the sidecar if
 * one holds real content. An empty/whitespace sidecar is treated as no backup.
 *
 * @param filePath - Absolute path to the Live Set (.als) file
 * @param deps - Node-side collaborators (the project-context mirror setter)
 * @returns A "restore" result carrying the blob, or "none"
 */
function restoreIfBackupExists(
  filePath: string,
  deps: ProjectContextBackupDeps,
): ProjectContextSyncResult {
  const sidecar = readProjectContextSidecar(filePath);

  if (sidecar == null || sidecar.trim() === "") {
    return { action: "none" };
  }

  deps.setProjectContext(sidecar);

  return { action: "restore", content: sidecar };
}

/**
 * Param was cleared by the user (empty, and not the session's first sync):
 * delete the sidecar so the clear sticks and isn't restored on the next load.
 *
 * @param filePath - Absolute path to the Live Set (.als) file
 * @returns A "clear" result when a sidecar was deleted, else "none"
 */
function clearBackupIfPresent(filePath: string): ProjectContextSyncResult {
  return deleteProjectContextSidecar(filePath)
    ? { action: "clear" }
    : { action: "none" };
}

/**
 * Param has content: write the sidecar when it's missing or differs (covers
 * both an ordinary edit and a first-save / Save-As to a folder with no backup
 * yet). A byte-identical sidecar is left untouched.
 *
 * @param filePath - Absolute path to the Live Set (.als) file
 * @param content - The device param's current project-context blob
 * @returns A "backup" result when written, else "none"
 */
function backupIfStale(
  filePath: string,
  content: string,
): ProjectContextSyncResult {
  const existing = readProjectContextSidecar(filePath);

  if (existing === content) {
    return { action: "none" };
  }

  writeProjectContextSidecar(filePath, content);

  return { action: "backup" };
}
