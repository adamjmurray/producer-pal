// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// V8-side driver for the on-disk project-context backup. The Live Set's
// file_path isn't observable, so instead of reacting to a save we pull it on
// every tool call (cheap: one getProperty) and only round-trip to Node when
// something might have changed — a first sync this session, a file_path change
// (first save / Save-As to a new folder), or an edited blob. Node owns the
// filesystem side (project-context-backup-node-routes.ts); this decides when to
// ask and applies a restore back into the device param. See dev/Memory-System.md.

import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { requestNode } from "./node-request-v8-protocol.ts";

/** Subset of the Node route's result this side acts on. */
interface ProjectContextSyncResult {
  action: "restore" | "backup" | "clear" | "none";
  content?: string;
}

/**
 * Cross-request memo so the vast majority of tool calls skip the Node hop. Only
 * a first sync, a changed file_path, or a changed blob warrants a round-trip.
 */
interface SyncMemo {
  syncedOnce: boolean;
  loadedWithContent: boolean;
  lastFilePath: string | null;
  lastContent: string | null;
}

const memo: SyncMemo = {
  syncedOnce: false,
  loadedWithContent: false,
  lastFilePath: null,
  lastContent: null,
};

/**
 * Back up or restore the project context for the current Live Set, if warranted.
 * Best-effort: any failure is logged and swallowed so it can't break the tool
 * call that triggered it.
 *
 * @param content - The device param's current project-context blob
 * @returns The restored blob when a restore happened (so the caller re-persists
 *   it into the device param), else null
 */
export async function syncProjectContextBackup(
  content: string,
): Promise<string | null> {
  const filePath = readLiveSetFilePath();

  // An unsaved set has no sidecar location. Forget the memo'd path so the next
  // save (file_path null -> a path) reads as a change and triggers a sync.
  if (filePath == null) {
    forgetMemoPath();

    return null;
  }

  if (!needsSync(filePath, content)) return null;

  // Restore is only valid on the first sync of a session: a device (re)load is
  // the one thing that wipes the param (e.g. an upgrade). After that, an empty
  // param is a deliberate user clear — Node propagates it instead of restoring.
  // isEdit is always false: a sync runs before every tool call and only
  // observes the param, so it must never push a stale blob over a differing
  // sidecar (that is how reopening an older Set used to clobber the folder's
  // shared notes). Creating a MISSING sidecar still works from here.
  const { ok, restored } = await requestSync(filePath, content, {
    allowRestore: !hasSyncedThisSession(),
    isEdit: false,
  });

  // Only memoize a completed sync, so a transient failure retries next call
  // rather than being remembered as done (important for the restore case).
  // The memo reads/writes live in synchronous helpers (not this async body) so
  // concurrent tool calls don't trip require-atomic-updates over shared state.
  if (ok) rememberSync(filePath, restored ?? content);

  return restored;
}

/**
 * Back up a genuine project-context write — the only thing allowed to overwrite
 * an existing, differing sidecar. Three write paths reach this through two
 * callers: a device-UI edit and a webui `POST /config` both arrive at V8's
 * `projectContext()` param setter, which fire-and-forgets this; a `ppal-context`
 * write calls it directly, because its own outlet is routed through `prepend set`
 * in the patch and so never re-enters that setter.
 *
 * It only backs up a non-empty blob or clears the sidecar for an emptied one — it
 * NEVER restores; treating an empty param as an upgrade wipe is the first
 * tool-call sync's job alone. The filesystem write still happens Node-side (this
 * only supplies the Live Set path and the blob), and the shared memo dedupes the
 * tool-call sync's own outlet round-trip so a restore echo through the setter
 * can't loop.
 *
 * @param content - The project-context blob that was just written
 */
export async function backupProjectContextOnEdit(
  content: string,
): Promise<void> {
  // Until this is ruled out, the device may have loaded upgrade-wiped and the
  // sidecar still holds the user's notes. Either a completed sync or a load
  // echo that carried content rules it out.
  const maybeWiped = !hasSyncedThisSession() && !memo.loadedWithContent;

  // Clearing now would delete the very sidecar the first sync restores from.
  if (content.trim() === "" && maybeWiped) return;

  const filePath = readLiveSetFilePath();

  // An unsaved set has no sidecar location. Forget the memo'd path so the next
  // save reads as a change and triggers a sync (mirrors syncProjectContextBackup).
  if (filePath == null) {
    forgetMemoPath();

    return;
  }

  if (!needsSync(filePath, content)) return;

  // Manual edits never restore, so allowRestore is always false. isEdit says
  // this write may overwrite an existing, differing sidecar — true for a
  // genuine project-context write (a device-UI edit, a webui POST /config, or
  // ppal-context write), but NOT while the device may have loaded wiped: the
  // first thing typed into an empty box would otherwise bury the folder's
  // notes, and nothing can restore them afterward (the param is no longer empty
  // and the sync only restores into an empty one). A missing sidecar is still
  // created either way. Only memoize a completed sync so a transient failure
  // retries next edit.
  const { ok } = await requestSync(filePath, content, {
    allowRestore: false,
    isEdit: !maybeWiped,
  });

  if (ok) rememberSync(filePath, content);
}

/**
 * Record what the device param held when the device loaded.
 *
 * A non-empty load echo rules out the upgrade wipe: nothing blanked the param,
 * so a later empty one is a deliberate user clear and may delete the sidecar
 * even before the session's first tool-call sync. Without this, clearing the
 * context in the device UI and then making any tool call restores it.
 *
 * @param content - The blob the load echo carried
 */
export function noteProjectContextLoaded(content: string): void {
  if (content.trim() !== "") memo.loadedWithContent = true;
}

/** Reset the cross-request memo. Test-only. */
export function resetProjectContextSyncMemo(): void {
  memo.syncedOnce = false;
  memo.loadedWithContent = false;
  memo.lastFilePath = null;
  memo.lastContent = null;
}

// --- Helpers below main export ---

/**
 * Whether the current Live Set + blob differ from the last completed sync.
 *
 * @param filePath - The current Live Set file path
 * @param content - The current project-context blob
 * @returns true when a sync round-trip is warranted
 */
function needsSync(filePath: string, content: string): boolean {
  return (
    !memo.syncedOnce ||
    filePath !== memo.lastFilePath ||
    content !== memo.lastContent
  );
}

/**
 * Whether at least one sync has completed since this V8 instance loaded. False
 * on a freshly (re)loaded device — the only state in which an empty param may be
 * an upgrade wipe rather than a user clear.
 *
 * @returns true once a sync has completed this session
 */
function hasSyncedThisSession(): boolean {
  return memo.syncedOnce;
}

/**
 * Record a completed sync so identical follow-up calls skip the Node hop.
 *
 * @param filePath - The synced Live Set file path
 * @param content - The blob now on disk (the restored value after a restore)
 */
function rememberSync(filePath: string, content: string): void {
  memo.syncedOnce = true;
  memo.lastFilePath = filePath;
  memo.lastContent = content;
}

/** Forget the memo'd path so the next non-null file_path reads as a change. */
function forgetMemoPath(): void {
  memo.lastFilePath = null;
}

/**
 * The current Live Set's absolute .als path, or null when unsaved (or the Live
 * API isn't ready). Live reports an empty string for an unsaved set.
 *
 * @returns Absolute path to the .als, or null
 */
function readLiveSetFilePath(): string | null {
  try {
    const raw = LiveAPI.from(livePath.liveSet).getProperty("file_path");

    return typeof raw === "string" && raw.length > 0 ? raw : null;
  } catch {
    // Live API not ready yet — treat as "no path" and try again next call.
    return null;
  }
}

/**
 * Ask Node to reconcile param and sidecar.
 *
 * @param filePath - Absolute path to the Live Set (.als) file
 * @param content - The device param's current project-context blob
 * @param flags - How Node should interpret this sync
 * @param flags.allowRestore - Whether an empty param may be restored from the
 *   sidecar (the session's first sync only)
 * @param flags.isEdit - Whether a genuine project-context write triggered this,
 *   the only thing allowed to overwrite an existing, differing sidecar
 * @returns `ok` false when the round-trip failed (so the caller can retry
 *   later); `restored` carries the blob on a restore, else null
 */
async function requestSync(
  filePath: string,
  content: string,
  flags: { allowRestore: boolean; isEdit: boolean },
): Promise<{ ok: boolean; restored: string | null }> {
  const response = await requestNode<ProjectContextSyncResult>(
    "projectContext.sync",
    { filePath, content, ...flags },
  );

  if (!response.success) {
    console.warn(`Project context backup sync failed: ${response.error}`);

    return { ok: false, restored: null };
  }

  if (response.result?.action === "restore") {
    return { ok: true, restored: response.result.content ?? "" };
  }

  return { ok: true, restored: null };
}
