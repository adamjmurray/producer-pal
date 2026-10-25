// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Keeps clip widgets current when Live changes by any route, hand edits
// included. The remote script (remote-script/Producer_Pal/watches.py) holds the
// Live listeners; this polls it and turns what it reports into `live` events on
// the gen-ui hub, which stays the only hub the view hears from.
//
// Best effort throughout. If the remote script is missing, old or silent the
// panel falls back to refreshing after AI writes, and says so. Nothing here
// may throw into a tool call or a request.

import { errorMessage } from "#src/shared/error-message.ts";
import { type GenUiEvent, type Widget } from "#src/shared/gen-ui-types.ts";
import * as console from "../../node-for-max-logger.ts";
import { callLiveApi } from "../../max-api-adapter.ts";
import {
  remoteScriptRequest,
  type RemoteScriptReply,
  type RemoteScriptRequest,
} from "../remote-script/remote-script-client.ts";
import { publish, setSync, subscribe } from "./gen-ui-hub.ts";
import { listWidgets } from "./widget-store.ts";

/** How often to ask the script for events while it answers. */
export const POLL_MS = 300;

/** How often to try again while it doesn't. */
export const RETRY_MS = 5000;

/** How long to wait before asking again for a watch the script refused. */
export const REFUSED_RETRY_MS = 5000;

const POLL_TIMEOUT_MS = 2000;
const SESSION_PATH = /^t\d+\/s\d+$/;

export interface WatcherDeps {
  request: (request: RemoteScriptRequest) => Promise<RemoteScriptReply>;
  /** The Session path of the clip with this id, or null. */
  resolvePath: (id: string) => Promise<string | null>;
  listWidgets: () => Widget[];
  publish: typeof publish;
  setSync: typeof setSync;
  now: () => number;
}

/** The remote script did not answer, or is too old to. */
class ScriptUnavailable extends Error {}

interface Registered {
  ref: string;
}

/** Follows the clip widgets in Live through the remote script. */
export class LiveWatcher {
  private readonly deps: WatcherDeps;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private unsubscribe: (() => void) | undefined;
  private ticking = false;
  private epoch: string | null = null;
  private since = 0;
  /** Owners the script is watching for us, by what they were registered with. */
  private readonly registered = new Map<string, Registered>();
  /** Owners not to register again until their widget changes. */
  private readonly settled = new Set<string>();
  /** When to try a refused owner again. */
  private readonly retryAt = new Map<string, number>();
  private available = true;
  /** Set when the script restarted: every clip must re-read, after re-registering. */
  private needsRefresh = false;
  private refreshedThisTick = false;
  /** A widget changed during a round, so go again at once. */
  private wakeAgain = false;

  constructor(deps: WatcherDeps) {
    this.deps = deps;
  }

  /** Follow widget changes, and start polling if clips are already on the view. */
  start(): void {
    this.unsubscribe ??= subscribe((event) => this.onEvent(event));
    this.wake();
  }

  /** Stop polling and following widgets. Watches in the script are left to expire with it. */
  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  /**
   * One round: register what's missing, then read events and pass them on.
   * Never throws. Public so tests can drive it without timers.
   */
  async tick(): Promise<void> {
    if (this.ticking) {
      return;
    }

    this.ticking = true;
    this.timer = undefined;
    this.refreshedThisTick = false;

    try {
      await this.round();
      this.markAvailable();
    } catch (error) {
      this.markUnavailable(error);
    } finally {
      this.ticking = false;
      this.scheduleNext();
    }
  }

  private async round(): Promise<void> {
    const clips = this.clipWidgets();

    if (clips.length === 0) {
      return;
    }

    await this.registerMissing(clips);

    const reply = await this.ask({
      route: "/events",
      query: { since: String(this.since) },
    });

    this.handleEvents(reply, clips);

    if (this.needsRefresh) {
      // The script lost its watches. Watch again before the clips re-read, so
      // nothing slips between the two.
      this.needsRefresh = false;
      await this.registerMissing(clips);
      this.refreshAll("the remote script restarted");
    }
  }

  // --- widgets ---------------------------------------------------------

  private onEvent(event: GenUiEvent): void {
    if (event.type !== "widget") {
      return;
    }

    try {
      if (event.change.op === "remove") {
        this.forget(event.change.id);
      } else if (event.change.widget.kind === "clip") {
        const known = this.registered.get(event.change.widget.id);

        // A new ref is a new watch.
        if (known != null && known.ref !== event.change.widget.ref) {
          this.forget(event.change.widget.id);
        }

        this.settled.delete(event.change.widget.id);
        this.retryAt.delete(event.change.widget.id);
      }

      this.wake();
    } catch (error) {
      console.warn(`Live watcher: ${errorMessage(error)}`);
    }
  }

  /**
   * Drop an owner and tell the script. Not awaited: the widget is already
   * gone, and a script that misses this clears the watch when it restarts.
   * @param owner - The widget id
   */
  private forget(owner: string): void {
    const wasRegistered = this.registered.delete(owner);

    this.settled.delete(owner);
    this.retryAt.delete(owner);

    if (wasRegistered) {
      this.deps
        .request({ method: "POST", route: "/unwatch", body: { owner } })
        .catch(() => undefined);
    }
  }

  private clipWidgets(): Array<Extract<Widget, { kind: "clip" }>> {
    return this.deps
      .listWidgets()
      .filter((w): w is Extract<Widget, { kind: "clip" }> => w.kind === "clip");
  }

  // --- the script -------------------------------------------------------

  private async registerMissing(
    clips: Array<Extract<Widget, { kind: "clip" }>>,
  ): Promise<void> {
    for (const clip of clips) {
      const due = this.retryAt.get(clip.id) ?? 0;

      if (
        this.registered.has(clip.id) ||
        this.settled.has(clip.id) ||
        due > this.deps.now()
      ) {
        continue;
      }

      await this.register(clip);
    }
  }

  private async register(
    clip: Extract<Widget, { kind: "clip" }>,
  ): Promise<void> {
    // A path follows its slot; an id stays with that one clip.
    const byPath = SESSION_PATH.test(clip.ref);
    const path = byPath ? clip.ref : await this.deps.resolvePath(clip.ref);

    if (path == null) {
      this.settled.add(clip.id);

      return;
    }

    const reply = await this.ask({
      method: "POST",
      route: "/watch",
      body: { owner: clip.id, path, follow: byPath },
    });

    if (reply.status !== 200) {
      // The slot isn't there yet, or the script is full. Try again later.
      this.retryAt.set(clip.id, this.deps.now() + REFUSED_RETRY_MS);

      return;
    }

    this.adoptEpoch(reply.body);
    this.registered.set(clip.id, { ref: clip.ref });
  }

  private async ask(
    request: RemoteScriptRequest,
  ): Promise<Extract<RemoteScriptReply, { available: true }>> {
    const reply = await this.deps.request({
      timeoutMs: POLL_TIMEOUT_MS,
      ...request,
    });

    if (!reply.available) {
      throw new ScriptUnavailable(
        reply.outdated ?? "the Producer Pal remote script is not reachable",
      );
    }

    return reply;
  }

  private handleEvents(
    reply: Extract<RemoteScriptReply, { available: true }>,
    clips: Array<Extract<Widget, { kind: "clip" }>>,
  ): void {
    const { body } = reply;

    if (reply.status !== 200 || typeof body.seq !== "number") {
      throw new ScriptUnavailable("the remote script gave an unusable reply");
    }

    if (this.adoptEpoch(body)) {
      return;
    }

    // A position behind ours means events we never saw were renumbered.
    const gap = body.seq < this.since;

    this.since = body.seq;

    if (body.resync === true || gap) {
      this.refreshAll("events were missed");

      return;
    }

    this.passOn(body.events, clips);
    this.reregisterDropped(body.watching);
  }

  /**
   * Note the script's epoch. A different one means it restarted or the Set
   * changed: every watch is gone, so register again and refresh every clip.
   * @param body - A reply carrying `epoch` and `seq`
   * @returns True when the epoch changed
   */
  private adoptEpoch(body: Record<string, unknown>): boolean {
    if (typeof body.epoch !== "string" || body.epoch === this.epoch) {
      return false;
    }

    const first = this.epoch == null;

    this.epoch = body.epoch;
    this.since = typeof body.seq === "number" ? body.seq : 0;

    if (first) {
      return false;
    }

    // Restarted: what we registered is gone.
    this.registered.clear();
    this.needsRefresh = true;

    return true;
  }

  private passOn(
    events: unknown,
    clips: Array<Extract<Widget, { kind: "clip" }>>,
  ): void {
    if (!Array.isArray(events)) {
      return;
    }

    const byId = new Map(clips.map((clip) => [clip.id, clip]));

    for (const item of events as Array<Record<string, unknown>>) {
      const clip = byId.get(String(item.owner));

      if (clip == null) {
        continue;
      }

      if (item.kind === "gone") {
        // A pinned clip is replaced or deleted. Its widget re-reads and says so.
        this.registered.delete(clip.id);
        this.settled.add(clip.id);
      }

      const isPath = SESSION_PATH.test(clip.ref);

      this.deps.publish({
        type: "live",
        tool: "remote-script",
        ids: isPath ? [] : [clip.ref],
        paths: isPath ? [clip.ref] : [],
        all: false,
      });
    }
  }

  private reregisterDropped(watching: unknown): void {
    const present = new Set(Array.isArray(watching) ? watching : []);

    for (const owner of this.registered.keys()) {
      if (!present.has(owner)) {
        this.registered.delete(owner);
      }
    }
  }

  private refreshAll(why: string): void {
    this.refreshedThisTick = true;
    console.info(`Live watcher: refreshing every clip widget (${why})`);
    this.deps.publish({
      type: "live",
      tool: "remote-script",
      ids: [],
      paths: [],
      all: true,
    });
  }

  // --- status and timing ---------------------------------------------------

  private markAvailable(): void {
    if (this.clipWidgets().length === 0) {
      return;
    }

    if (!this.available) {
      // Back after a silence: anything may have changed meanwhile.
      this.available = true;

      if (!this.refreshedThisTick) {
        this.refreshAll("the remote script is reachable again");
      }
    }

    const total = this.clipWidgets().length;
    const watched = this.registered.size;

    this.deps.setSync({
      mode: "listening",
      detail:
        watched === total
          ? "Watching clips in Live: hand edits show up here."
          : `Watching ${watched} of ${total} clips in Live; the rest refresh after AI changes.`,
    });
  }

  private markUnavailable(error: unknown): void {
    const why =
      error instanceof ScriptUnavailable ? error.message : errorMessage(error);

    if (this.available) {
      console.warn(`Live watcher: ${why}`);
    }

    this.available = false;
    this.deps.setSync({
      mode: "writes-only",
      detail: `Clips refresh after AI changes only (${why}).`,
    });
  }

  /** Poll now instead of at the next beat, e.g. because a widget changed. */
  private wake(): void {
    if (this.ticking) {
      this.wakeAgain = true;
    } else {
      this.schedule(0);
    }
  }

  private scheduleNext(): void {
    if (this.unsubscribe == null || this.clipWidgets().length === 0) {
      return;
    }

    const soon = this.wakeAgain;

    this.wakeAgain = false;
    this.schedule(soon ? 0 : this.available ? POLL_MS : RETRY_MS);
  }

  private schedule(delayMs: number): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.tick(), delayMs);
    this.timer.unref();
  }
}

let shared: LiveWatcher | undefined;

/** Start following clip widgets in Live. Safe to call twice. */
export function startLiveWatcher(): void {
  shared ??= new LiveWatcher({
    request: remoteScriptRequest,
    resolvePath: resolveClipPath,
    listWidgets,
    publish,
    setSync,
    now: Date.now,
  });
  shared.start();
}

/** Stop the shared watcher. For tests. */
export function stopLiveWatcher(): void {
  shared?.stop();
  shared = undefined;
}

/**
 * Find a clip's Session path, so an id can be watched by slot.
 * @param id - A clip id
 * @returns The path like "t0/s3", or null for an arrangement clip or a miss
 */
export async function resolveClipPath(id: string): Promise<string | null> {
  try {
    const response = await callLiveApi(
      "ppal-read-clip",
      { id, include: [] },
      { compactOutput: false },
    );
    const text = (response as { content: Array<{ text: string }> }).content[0]
      ?.text;
    const path = (JSON.parse(text ?? "null") as { path?: unknown } | null)
      ?.path;

    return typeof path === "string" && SESSION_PATH.test(path) ? path : null;
  } catch {
    return null;
  }
}
