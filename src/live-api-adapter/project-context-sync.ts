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
  action: "restore" | "backup" | "clear" | "none" | "failed" | "unreadable";
  content?: string;
}

/**
 * Where this device load stands on the upgrade-wipe question — "did the param
 * come up empty because a device (re)load blanked it, or because the user has
 * nothing saved?" Only "ruledOut" lets an edit overwrite a differing sidecar.
 *
 * - `open`: unresolved. Nothing has proven the param wasn't wiped yet.
 * - `ruledOut`: proven not wiped — the load echo carried content, or a
 *   tool-call sync completed before anything was edited.
 * - `stuck`: the user edited while it was still open, so the param is no longer
 *   what the device loaded and nothing can prove it either way. Stays
 *   conservative for the rest of the session; the next device load re-decides.
 */
type WipeState = "open" | "ruledOut" | "stuck";

/**
 * Cross-request memo so the vast majority of tool calls skip the Node hop. Only
 * a first sync, a changed file_path, or a changed blob warrants a round-trip.
 */
interface SyncMemo {
  syncedOnce: boolean;
  wipe: WipeState;
  lastFilePath: string | null;
  lastContent: string | null;
  /** Whether the unreadable-on-restore warning was already said this session. */
  warnedUnreadableRestore: boolean;
}

const memo: SyncMemo = {
  syncedOnce: false,
  wipe: "open",
  lastFilePath: null,
  lastContent: null,
  warnedUnreadableRestore: false,
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

  const allowRestore = !hasSyncedThisSession();

  // An empty param with the restore already spent and the wipe unresolved: the
  // sidecar may still hold the notes a device (re)load blanked, and Node's only
  // remaining move on an empty param is a clear. Skip it. Reachable only as
  // "stuck" (an edit before the session's first sync burns the restore without
  // answering the question), so it holds until the next device load.
  if (content.trim() === "" && !allowRestore && memo.wipe !== "ruledOut") {
    return null;
  }

  // Restore is only valid on the first sync of a session: a device (re)load is
  // the one thing that wipes the param (e.g. an upgrade). After that, an empty
  // param is a deliberate user clear — Node propagates it instead of restoring.
  // isEdit is always false: a sync runs before every tool call and only
  // observes the param, so it must never push a stale blob over a differing
  // sidecar (that is how reopening an older Set used to clobber the folder's
  // shared notes). Creating a MISSING sidecar still works from here.
  const { ok, restored } = await requestSync(filePath, content, {
    allowRestore,
    isEdit: false,
    isWrite: false,
  });

  // Only memoize a completed sync, so a transient failure retries next call
  // rather than being remembered as done (important for the restore case).
  // The memo reads/writes live in synchronous helpers (not this async body) so
  // concurrent tool calls don't trip require-atomic-updates over shared state.
  if (ok) {
    rememberSync(filePath, restored ?? content);
    // This sync saw the param as the device loaded it (nothing has been edited
    // yet, or the wipe question is already settled), so it settles the question:
    // either it restored, or the param was non-empty / no backup existed.
    if (memo.wipe === "open") memo.wipe = "ruledOut";
  }

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
  // sidecar still holds the user's notes. Deliberately NOT "have we synced
  // once": this function's own sync would then rule it out, so only the FIRST
  // thing typed into a wiped param would be protected and the second would bury
  // the notes. See WipeState.
  const maybeWiped = memo.wipe !== "ruledOut";

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

  // Writing while the question is open puts the user's own text in the param,
  // so nothing can answer it afterward — latch it stuck so every later edit this
  // session stays conservative too. Set before the await so a concurrent edit
  // sees it.
  if (maybeWiped) memo.wipe = "stuck";

  // Manual edits never restore, so allowRestore is always false. isEdit says
  // this write may overwrite an existing, differing sidecar — true for a
  // genuine project-context write (a device-UI edit, a webui POST /config, or
  // ppal-context write), but NOT while the device may have loaded wiped: the
  // first thing typed into an empty box would otherwise bury the folder's
  // notes, and nothing can restore them afterward (the param is no longer empty
  // and the sync only restores into an empty one). A missing sidecar is still
  // created either way, which covers the ordinary "no backup yet" case. isWrite
  // stays true even then — it's what this sync IS, not what Node may do with it,
  // and a write that didn't reach disk has to say so either way. Only memoize a
  // completed sync so a transient failure retries next edit.
  const { ok } = await requestSync(filePath, content, {
    allowRestore: false,
    isEdit: !maybeWiped,
    isWrite: true,
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
  if (content.trim() !== "") memo.wipe = "ruledOut";
}

/** Reset the cross-request memo. Test-only. */
export function resetProjectContextSyncMemo(): void {
  memo.syncedOnce = false;
  memo.wipe = "open";
  memo.lastFilePath = null;
  memo.lastContent = null;
  memo.warnedUnreadableRestore = false;
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
 * @param flags - How to interpret this sync
 * @param flags.allowRestore - Whether an empty param may be restored from the
 *   sidecar (the session's first sync only)
 * @param flags.isEdit - Whether Node may overwrite an existing, differing
 *   sidecar with this blob
 * @param flags.isWrite - Whether a genuine project-context write triggered this
 *   sync. Local only (not sent): it decides what an unreadable sidecar COST,
 *   which isEdit can't answer — a write while the wipe question is open is a
 *   real write that still isn't allowed to overwrite.
 * @returns `ok` false when nothing reached disk and the next sync should retry;
 *   `restored` carries the blob on a restore, else null
 */
async function requestSync(
  filePath: string,
  content: string,
  flags: { allowRestore: boolean; isEdit: boolean; isWrite: boolean },
): Promise<{ ok: boolean; restored: string | null }> {
  const response = await requestNode<ProjectContextSyncResult>(
    "projectContext.sync",
    {
      filePath,
      content,
      allowRestore: flags.allowRestore,
      isEdit: flags.isEdit,
    },
  );

  if (!response.success) {
    console.warn(`Project context backup sync failed: ${response.error}`);

    return { ok: false, restored: null };
  }

  if (response.result?.action === "restore") {
    return { ok: true, restored: response.result.content ?? "" };
  }

  // There IS a sidecar and Node couldn't read it, so it skipped what it would
  // otherwise have done. What that cost depends on which sync this was.
  if (response.result?.action === "unreadable") {
    return handleUnreadableSidecar(content, flags.isWrite);
  }

  // The filesystem refused. Reported as ok so the caller memoizes it: the
  // sidecar is broken for a reason retrying won't fix (a read-only volume, a
  // locked cloud-sync folder), and not memoizing would re-warn on every tool
  // call for the rest of the session. Memoizing on (path, content) still tells
  // the user again if they change the context and it still won't save.
  //
  // An empty blob was a clear, which fails the opposite way round: the sidecar
  // survived, so the next device load restores what was just deleted.
  if (response.result?.action === "failed") {
    console.warn(
      content.trim() === ""
        ? "Could not delete the project context backup beside the Live Set, " +
            "so a device reload will restore the context that was just " +
            "cleared. Tell the user to delete " +
            '"Producer Pal Project Context.md" by hand.'
        : "Could not save the project context backup beside the Live Set " +
            "(the Live project folder may be read-only). The context is safe " +
            "in the device, but won't survive a device upgrade. Tell the user.",
    );
  }

  return { ok: true, restored: null };
}

/**
 * React to a sidecar Node couldn't read. Node skipped what it would have done;
 * three callers reach it, and only two of them lost something:
 *
 * - An empty blob was the restore, which is still owed. The wipe question stays
 *   open too, so no later edit buries notes nothing has read.
 * - A genuine write didn't reach disk. Warned once per blob, so a later edit
 *   says so again.
 * - A passing sync lost nothing: it was never allowed to overwrite an existing
 *   sidecar anyway. Memoized silently.
 *
 * Neither of the first two memoizes. Unlike a filesystem refusal, an unreadable
 * sidecar is usually a passing lock (cloud sync), and memoizing would forfeit
 * the retry for the rest of the session.
 *
 * @param content - The blob this sync carried ("" means it was the restore)
 * @param isWrite - Whether a genuine project-context write triggered this sync
 * @returns The requestSync result for this case
 */
function handleUnreadableSidecar(
  content: string,
  isWrite: boolean,
): { ok: boolean; restored: null } {
  if (content.trim() === "") {
    warnUnreadableRestoreOnce();

    return { ok: false, restored: null };
  }

  if (isWrite) {
    console.warn(
      "Could not read the project context backup beside the Live Set, so it " +
        "was left alone rather than risk burying notes shared with the other " +
        "Sets in the folder. The context is safe in the device, but won't " +
        'survive a device upgrade. Tell the user to check that "Producer Pal ' +
        'Project Context.md" in their Live project folder is readable.',
    );

    return { ok: false, restored: null };
  }

  return { ok: true, restored: null };
}

/**
 * Say once per session that the sidecar couldn't be read, so the context wasn't
 * restored. Once, because unlike a failed write this isn't memoized — the read
 * retries on every tool call, and a permission problem would re-warn into every
 * tool result for the rest of the session.
 */
function warnUnreadableRestoreOnce(): void {
  if (memo.warnedUnreadableRestore) return;

  memo.warnedUnreadableRestore = true;

  console.warn(
    "Could not read the project context backup beside the Live Set, so the " +
      "saved context was not restored into the device. Tell the user to check " +
      'that "Producer Pal Project Context.md" in their Live project folder is ' +
      "readable; the restore retries on the next tool call.",
  );
}
