// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Keeps clip widgets current when Live changes by any route, hand edits
// included. The remote script (remote-script/Producer_Pal/watches.py) holds the
// Live listeners and follows each clip object; this polls it and turns what it
// reports into `live` events on the gen-ui hub, which stays the only hub the
// view hears from.
//
// A widget follows its clip: when the clip moves, the widget's stored path is
// updated; when the clip is deleted or replaced, the widget is marked gone and
// stays so. After a restart the script has lost object identity, so each widget
// is bound again from its last path, and only if the clip there still matches
// its fingerprint (name and length). Otherwise it is gone, not a wrong clip.
//
// Best effort throughout. If the remote script is missing, old or silent the
// panel falls back to refreshing after AI writes, and says so. Nothing here
// may throw into a tool call or a request.

import { errorMessage } from "#src/shared/error-message.ts";
import {
  type ClipWidget,
  type GenUiEvent,
  type Widget,
} from "#src/shared/gen-ui-types.ts";
import * as console from "../../node-for-max-logger.ts";
import {
  remoteScriptRequest,
  type RemoteScriptReply,
  type RemoteScriptRequest,
} from "../remote-script/remote-script-client.ts";
import { publish, setSync, subscribe } from "./gen-ui-hub.ts";
import { listWidgets, updateClipState } from "./widget-store.ts";

/** How often to ask the script for events while it answers. */
export const POLL_MS = 300;

/** How often to try again while it doesn't. */
export const RETRY_MS = 5000;

/** How long to wait before asking again for a watch the script refused. */
export const REFUSED_RETRY_MS = 5000;

const POLL_TIMEOUT_MS = 2000;
const SESSION_PATH = /^t\d+\/s\d+$/;

/** Why the script refused a watch because the clip isn't there to follow. */
const NO_CLIP_REASONS = new Set(["empty", "mismatch", "no_slot"]);

export interface WatcherDeps {
  request: (request: RemoteScriptRequest) => Promise<RemoteScriptReply>;
  listWidgets: () => Widget[];
  updateClipState: typeof updateClipState;
  publish: typeof publish;
  setSync: typeof setSync;
  now: () => number;
}

type Answer = Extract<RemoteScriptReply, { available: true }>;

/** The remote script did not answer, or is too old to. */
class ScriptUnavailable extends Error {}

/** What we asked the script to watch for a widget. */
interface Registered {
  ref: string;
  /** The script keeps a record of a gone clip until it is unwatched. */
  gone?: true;
}

/** Follows the clip widgets in Live through the remote script. */
export class LiveWatcher {
  private readonly deps: WatcherDeps;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private unsubscribe: (() => void) | undefined;
  private ticking = false;
  private epoch: string | null = null;
  private since = 0;
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
    if (this.clipWidgets().length === 0) {
      return;
    }

    if (this.epoch == null) {
      // First contact. Learn the script's epoch before judging anything, so
      // the verdicts below aren't undone by it.
      const hello = await this.ask({ route: "/events" });

      if (hello.status === 200) {
        this.adoptEpoch(hello.body);
      }
    }

    await this.registerMissing();

    const reply = await this.ask({
      route: "/events",
      query: { since: String(this.since) },
    });

    this.handleEvents(reply);

    if (this.needsRefresh) {
      // The script lost its watches. Watch again before the clips re-read, so
      // nothing slips between the two.
      this.needsRefresh = false;
      await this.registerMissing();
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
        this.onClipWidget(event.change.widget);
      }

      this.wake();
    } catch (error) {
      console.warn(`Live watcher: ${errorMessage(error)}`);
    }
  }

  private onClipWidget(widget: ClipWidget): void {
    const known = this.registered.get(widget.id);

    // A new ref is a different clip, and a widget that is no longer gone is to
    // be bound again. Our own move updates register the new ref first.
    if (
      known != null &&
      (known.ref !== widget.ref || (known.gone && !widget.gone))
    ) {
      this.forget(widget.id);
    }

    if (!widget.gone) {
      this.settled.delete(widget.id);
      this.retryAt.delete(widget.id);
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

  /** @returns The clip widgets that still have a clip to follow */
  private clipWidgets(): ClipWidget[] {
    return this.deps
      .listWidgets()
      .filter((w): w is ClipWidget => w.kind === "clip" && w.gone !== true);
  }

  private markGone(widget: ClipWidget): void {
    this.registered.set(widget.id, { ref: widget.ref, gone: true });
    this.settled.add(widget.id);
    this.deps.updateClipState(widget.id, { gone: true });
  }

  // --- the script -------------------------------------------------------

  private async registerMissing(): Promise<void> {
    for (const clip of this.clipWidgets()) {
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

  private async register(clip: ClipWidget): Promise<void> {
    if (!SESSION_PATH.test(clip.ref)) {
      // An id from before widgets were kept by path. Nothing to watch.
      this.settled.add(clip.id);

      return;
    }

    const reply = await this.ask({
      method: "POST",
      route: "/watch",
      body: {
        owner: clip.id,
        path: clip.ref,
        ...(clip.fingerprint == null ? {} : { fingerprint: clip.fingerprint }),
      },
    });

    if (reply.status !== 200) {
      this.refused(clip, reply);

      return;
    }

    this.adoptEpoch(reply.body);
    this.registered.set(clip.id, { ref: clip.ref });

    const fingerprint = reply.body.fingerprint;

    if (clip.fingerprint == null && isFingerprint(fingerprint)) {
      this.deps.updateClipState(clip.id, { fingerprint });
    }
  }

  /**
   * The script said no. If the clip isn't there to follow, the widget is gone;
   * a full script or a hiccup is tried again later.
   * @param clip - The widget
   * @param reply - The refusal
   */
  private refused(clip: ClipWidget, reply: Answer): void {
    if (NO_CLIP_REASONS.has(String(reply.body.reason))) {
      this.markGone(clip);
    } else {
      this.retryAt.set(clip.id, this.deps.now() + REFUSED_RETRY_MS);
    }
  }

  private async ask(request: RemoteScriptRequest): Promise<Answer> {
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

  private handleEvents(reply: Answer): void {
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

    this.passOn(body.events);
    this.reregisterDropped(body.watching);
  }

  /**
   * Note the script's epoch. A different one means it restarted or the Set
   * changed: its watches are gone, and so is any "gone" verdict reached under
   * the old one. Every widget binds again from its last path and fingerprint.
   * @param body - A reply carrying `epoch` and `seq`
   * @returns True when the epoch changed after the first contact
   */
  private adoptEpoch(body: Record<string, unknown>): boolean {
    if (typeof body.epoch !== "string" || body.epoch === this.epoch) {
      return false;
    }

    const first = this.epoch == null;

    this.epoch = body.epoch;
    this.since = typeof body.seq === "number" ? body.seq : 0;
    this.registered.clear();
    this.settled.clear();

    // Widgets marked gone under an old Set or session get judged again.
    for (const widget of this.deps.listWidgets()) {
      if (widget.kind === "clip" && widget.gone === true) {
        this.deps.updateClipState(widget.id, { gone: false });
      }
    }

    if (first) {
      return false;
    }

    this.needsRefresh = true;

    return true;
  }

  private passOn(events: unknown): void {
    if (!Array.isArray(events)) {
      return;
    }

    const byId = new Map(this.clipWidgets().map((clip) => [clip.id, clip]));

    for (const item of events as Array<Record<string, unknown>>) {
      const clip = byId.get(String(item.owner));

      if (clip == null) {
        continue;
      }

      const paths = [clip.ref];

      if (item.kind === "gone") {
        this.markGone(clip);
      } else if (
        item.kind === "moved" &&
        SESSION_PATH.test(String(item.path))
      ) {
        // Note the new path first: the widget update that follows must not
        // look like a different clip to onEvent.
        const path = String(item.path);

        this.registered.set(clip.id, { ref: path });
        this.deps.updateClipState(clip.id, { ref: path });
        paths.unshift(path);
      }

      this.deps.publish({
        type: "live",
        tool: "remote-script",
        ids: [],
        paths,
        all: false,
      });
    }
  }

  private reregisterDropped(watching: unknown): void {
    const present = new Set(Array.isArray(watching) ? watching : []);

    for (const [owner, entry] of this.registered) {
      if (entry.gone !== true && !present.has(owner)) {
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
    const total = this.clipWidgets().length;

    if (total === 0) {
      return;
    }

    if (!this.available) {
      // Back after a silence: anything may have changed meanwhile.
      this.available = true;

      if (!this.refreshedThisTick) {
        this.refreshAll("the remote script is reachable again");
      }
    }

    const watched = this.clipWidgets().filter((w) =>
      this.registered.has(w.id),
    ).length;

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
    listWidgets,
    updateClipState,
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
 * @param value - Anything a reply field may hold
 * @returns True for `{name, length}`
 */
function isFingerprint(
  value: unknown,
): value is { name: string; length: number } {
  const candidate = value as { name?: unknown; length?: unknown } | null;

  return (
    typeof candidate?.name === "string" && typeof candidate.length === "number"
  );
}
