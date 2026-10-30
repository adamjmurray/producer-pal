// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Keeps the widget list in the Live Set, through the remote script's song data
// (remote-script/Producer_Pal/ui_widgets.py). Unlike a device parameter, that
// adds no Live undo step, so saving can't get in the way of the user's own
// undo. The catch: it doesn't mark the Set as changed, so a widget-only change
// is lost if the user quits without saving.
//
// Each Set has its own device and so its own Node process. The Set's list is
// loaded on first contact, and nothing is saved before that, or an empty new
// list would wipe the Set's. Changes made meanwhile stay in memory and are
// merged in by loadWidgetsFromSet. Without the remote script (missing, or too
// old for the route) widgets last for the session and aren't saved.
//
// The live watcher can't carry this: it only polls while clip widgets exist,
// and what it learns (the script's epoch) doesn't matter here, since the data
// lives in the Set, not in the script.

import { errorMessage } from "#src/shared/error-message.ts";
import { nodeWarn } from "../../node-for-max-logger.ts";
import {
  remoteScriptRequest,
  replyError,
  type RemoteScriptReply,
  type RemoteScriptRequest,
} from "../remote-script/remote-script-client.ts";
import { encodeWidgets } from "./widget-blob.ts";
import {
  listWidgets,
  loadWidgetsFromSet,
  setWidgetSink,
} from "./widget-store.ts";

/** How long to wait before asking again while the script doesn't answer. */
export const RETRY_MS = 5000;

/** Changes this close together are saved as one. */
export const SAVE_DELAY_MS = 250;

const REQUEST_TIMEOUT_MS = 5000;

export interface SetStorageDeps {
  request: (request: RemoteScriptRequest) => Promise<RemoteScriptReply>;
  /** Show the Set's list (see loadWidgetsFromSet). */
  load: (text: string) => void;
  /** @returns The text for the widgets shown now, or null if it is too big */
  currentText: () => string | null;
}

/** The script did not answer, is too old for the route, or refused the call. */
class SaveFailed extends Error {}

/** Loads the Set's widget list, then saves changes to it. */
export class SetStorage {
  private readonly deps: SetStorageDeps;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private working = false;
  private loaded = false;
  /** The newest list not yet saved. Only the latest matters. */
  private pending: string | undefined;
  private stopped = false;
  /** Already warned about the current failure. */
  private warned = false;

  constructor(deps: SetStorageDeps) {
    this.deps = deps;
  }

  /** Try to reach the script now, and keep trying until the list is loaded. */
  start(): void {
    this.stopped = false;
    this.schedule(0);
  }

  /** Stop trying. Anything unsaved is dropped. */
  stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  /**
   * A widget change: keep the newest list to save once the Set's list is in.
   * @param text - The whole list
   */
  save(text: string): void {
    this.pending = text;

    // While working or not yet loaded, the round in progress or the retry
    // already due picks it up.
    if (!this.working && this.loaded && !this.stopped && this.timer == null) {
      this.schedule(SAVE_DELAY_MS);
    }
  }

  /**
   * One round: load the Set's list if it isn't in yet, then save what is
   * waiting. Never throws. Public so tests can drive it without timers.
   */
  async sync(): Promise<void> {
    if (this.working) {
      return;
    }

    this.working = true;
    this.timer = undefined;

    let failed = false;

    try {
      if (!this.loaded) {
        await this.loadList();
      }

      await this.saveList();
      this.warned = false;
    } catch (error) {
      failed = true;
      this.warnOnce(error);
    } finally {
      this.working = false;
    }

    // A change that came in during the round is still pending.
    if (!this.stopped && (failed || this.pending != null)) {
      this.schedule(failed ? RETRY_MS : SAVE_DELAY_MS);
    }
  }

  private async loadList(): Promise<void> {
    const body = await this.ask({ route: "/ui-widgets" });
    const text = typeof body.text === "string" ? body.text : null;

    // Changes made before the list arrived get merged in after the Set's, so
    // they have to be saved. Otherwise what the Set held is already saved.
    const madeEarly = this.pending != null;

    this.loaded = true;

    if (text != null) {
      this.deps.load(text);
    }

    this.pending = madeEarly
      ? (this.deps.currentText() ?? undefined)
      : undefined;
  }

  private async saveList(): Promise<void> {
    const text = this.pending;

    if (text == null) {
      return;
    }

    await this.ask({
      method: "POST",
      route: "/ui-widgets/save",
      body: { text },
    });

    // Keep a newer list that came in while this one was on its way.
    if (this.pending === text) {
      this.pending = undefined;
    }
  }

  /**
   * @param request - What to send
   * @returns The reply body of a 200
   * @throws SaveFailed when the script is silent, too old or says no
   */
  private async ask(
    request: RemoteScriptRequest,
  ): Promise<Record<string, unknown>> {
    const reply = await this.deps.request({
      timeoutMs: REQUEST_TIMEOUT_MS,
      ...request,
    });

    if (!reply.available) {
      throw new SaveFailed(
        reply.outdated ?? "the Producer Pal remote script is not reachable",
      );
    }

    if (reply.status !== 200) {
      throw new SaveFailed(replyError(reply));
    }

    return reply.body;
  }

  private warnOnce(error: unknown): void {
    if (this.warned) {
      return;
    }

    this.warned = true;

    const why =
      error instanceof SaveFailed ? error.message : errorMessage(error);

    nodeWarn(`The UI widgets are not saved in the Live Set: ${why}`);
  }

  private schedule(delayMs: number): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.sync(), delayMs);
    this.timer.unref();
  }
}

let shared: SetStorage | undefined;

/**
 * Save widget changes into the Live Set, and load the list the Set holds. Safe
 * to call twice.
 */
export function connectWidgetsToSet(): void {
  if (shared != null) {
    return;
  }

  shared = new SetStorage({
    request: remoteScriptRequest,
    load: loadWidgetsFromSet,
    currentText: () => encodeWidgets(listWidgets()),
  });
  setWidgetSink((text) => shared?.save(text));
  shared.start();
}

/** Stop saving and forget the connection. For tests. */
export function disconnectWidgetsFromSet(): void {
  shared?.stop();
  shared = undefined;
  setWidgetSink(undefined);
}
