// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The generative-UI event bus: one version counter and the connected viewers.
// Every event gets the next version, so a viewer that sees a jump knows it
// missed something and reloads the snapshot.

import { randomUUID } from "node:crypto";
import { errorMessage } from "#src/shared/error-message.ts";
import { type GenUiEvent, type SyncStatus } from "#src/shared/gen-ui-types.ts";
import { nodeWarn } from "../../node-for-max-logger.ts";

/** An event before the hub stamps its version on it. */
export type UnversionedEvent =
  | Omit<Extract<GenUiEvent, { type: "widget" }>, "version">
  | Omit<Extract<GenUiEvent, { type: "live" }>, "version">
  | Omit<Extract<GenUiEvent, { type: "status" }>, "version">;

type Listener = (event: GenUiEvent) => void;

/**
 * Changes on every server start. A viewer that reconnects after a restart
 * can't trust its version numbers, so the snapshot carries this.
 */
export const EPOCH = randomUUID();

const listeners = new Set<Listener>();
let version = 0;

const DEFAULT_SYNC: SyncStatus = {
  mode: "writes-only",
  detail: "Live listeners are not connected; clips refresh after AI changes.",
};

let sync: SyncStatus = DEFAULT_SYNC;

/** @returns How clip widgets are being kept current */
export function getSync(): SyncStatus {
  return sync;
}

/**
 * Record how clips are being kept current and tell viewers if it changed.
 * @param next - The new status
 */
export function setSync(next: SyncStatus): void {
  if (next.mode === sync.mode && next.detail === sync.detail) {
    return;
  }

  sync = next;
  publish({ type: "status", sync: next });
}

/** @returns The version of the last event */
export function currentVersion(): number {
  return version;
}

/**
 * Watch the stream.
 * @param listener - Called with every event, in order
 * @returns A function that stops watching
 */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

/**
 * Number an event and hand it to every viewer. A viewer that throws (a dead
 * socket) is dropped; it never stops the others or the caller.
 *
 * @param event - What happened
 * @returns The event as sent
 */
export function publish(event: UnversionedEvent): GenUiEvent {
  version += 1;

  const stamped = { ...event, version } as GenUiEvent;

  for (const listener of listeners) {
    try {
      listener(stamped);
    } catch (error) {
      nodeWarn(`Dropping a UI viewer: ${errorMessage(error)}`);
      listeners.delete(listener);
    }
  }

  return stamped;
}

/** Forget every viewer and restart the count. For tests. */
export function resetHubForTesting(): void {
  listeners.clear();
  version = 0;
  sync = DEFAULT_SYNC;
}
