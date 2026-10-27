// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type GenUiEvent } from "#src/shared/gen-ui-types.ts";
import {
  type RemoteScriptReply,
  type RemoteScriptRequest,
} from "../../remote-script/remote-script-client.ts";

export interface TestEventStream {
  /** The next event, skipping comments; rejects if none arrives in a second. */
  next: () => Promise<GenUiEvent>;
  /** The next raw block (an event, a comment, a `retry:` line). */
  nextBlock: () => Promise<string>;
  close: () => Promise<void>;
}

/**
 * Open a server-sent event stream the way a browser would, and read it one
 * block at a time.
 *
 * @param url - The stream's URL
 * @returns Reader for the stream
 */
export async function openEventStream(url: string): Promise<TestEventStream> {
  const controller = new AbortController();
  const response = await fetch(url, { signal: controller.signal });

  if (!response.ok || response.body == null) {
    throw new Error(`Event stream refused: HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const nextBlock = async (): Promise<string> => {
    while (!buffer.includes("\n\n")) {
      const chunk = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("No event arrived")), 1000),
        ),
      ]);

      if (chunk.done) {
        throw new Error("Event stream ended");
      }

      buffer += decoder.decode(chunk.value, { stream: true });
    }

    const split = buffer.indexOf("\n\n");
    const block = buffer.slice(0, split);

    buffer = buffer.slice(split + 2);

    return block;
  };

  const next = async (): Promise<GenUiEvent> => {
    for (;;) {
      const block = await nextBlock();
      const data = block.split("\n").find((line) => line.startsWith("data: "));

      if (data != null) {
        return JSON.parse(data.slice("data: ".length)) as GenUiEvent;
      }
    }
  };

  const close = async (): Promise<void> => {
    controller.abort();
    await reader.cancel().catch(() => undefined);
  };

  return { next, nextBlock, close };
}

export interface FakeClip {
  name: string;
  length: number;
}

/** Stands in for the remote script's /watch, /unwatch, /events and /ui-widgets. */
export class FakeScript {
  epoch = "e1";
  seq = 0;
  /** What is in each Session slot. */
  slots: Record<string, FakeClip | undefined> = {};
  watching = new Set<string>();
  events: Array<Record<string, unknown>> = [];
  down: false | { outdated?: string } = false;
  limit = false;
  resync = false;
  requests: RemoteScriptRequest[] = [];
  /** The widget list the Set holds (/ui-widgets), null when none. */
  widgetText: string | null = null;
  /** Every list saved, oldest first. */
  saves: string[] = [];
  /** Answer saves with this status instead of keeping them. */
  saveStatus = 200;
  /** Fail the next request the way a timeout does. */
  failNext: Error | undefined;

  request = (request: RemoteScriptRequest): Promise<RemoteScriptReply> => {
    this.requests.push(request);

    if (this.failNext != null) {
      const error = this.failNext;

      this.failNext = undefined;

      return Promise.reject(error);
    }

    if (this.down) {
      return Promise.resolve({
        available: false,
        ...(this.down.outdated == null ? {} : { outdated: this.down.outdated }),
      });
    }

    return Promise.resolve({ available: true, ...this.answer(request) });
  };

  restart(): void {
    this.epoch = "e2";
    this.seq = 0;
    this.watching.clear();
    this.events = [];
  }

  emit(owner: string, kind = "changed", extra = {}): void {
    this.seq += 1;
    this.events.push({
      seq: this.seq,
      owner,
      kind,
      fields: ["notes"],
      ...extra,
    });
  }

  routes(route: string): RemoteScriptRequest[] {
    return this.requests.filter((r) => r.route === route);
  }

  private answer(request: RemoteScriptRequest): {
    status: number;
    body: Record<string, unknown>;
  } {
    const body = (request.body ?? {}) as {
      owner?: string;
      path?: string;
      fingerprint?: FakeClip;
    };

    if (request.route === "/ui-widgets") {
      return { status: 200, body: { text: this.widgetText } };
    }

    if (request.route === "/ui-widgets/save") {
      return this.saveWidgets(String((request.body as { text?: string }).text));
    }

    if (request.route === "/watch") {
      return this.watch(body);
    }

    if (request.route === "/unwatch") {
      this.watching.delete(String(body.owner));

      return { status: 200, body: { existed: true } };
    }

    const since = Number(request.query?.since ?? 0);
    const resync = this.resync;

    this.resync = false;

    return {
      status: 200,
      body: {
        epoch: this.epoch,
        seq: this.seq,
        resync,
        events: resync ? [] : this.events.filter((e) => Number(e.seq) > since),
        watching: [...this.watching],
      },
    };
  }

  private saveWidgets(text: string): {
    status: number;
    body: Record<string, unknown>;
  } {
    if (this.saveStatus !== 200) {
      return { status: this.saveStatus, body: { error: "refused" } };
    }

    this.widgetText = text;
    this.saves.push(text);

    return { status: 200, body: { ok: true } };
  }

  private watch(body: {
    owner?: string;
    path?: string;
    fingerprint?: FakeClip;
  }): {
    status: number;
    body: Record<string, unknown>;
  } {
    const clip = this.slots[String(body.path)];

    if (this.limit) {
      return { status: 409, body: { reason: "limit", error: "full" } };
    }

    if (clip == null) {
      return { status: 404, body: { reason: "empty", error: "empty" } };
    }

    const { fingerprint } = body;

    if (
      fingerprint != null &&
      (fingerprint.name !== clip.name || fingerprint.length !== clip.length)
    ) {
      return { status: 409, body: { reason: "mismatch", error: "other clip" } };
    }

    this.watching.add(String(body.owner));

    return {
      status: 200,
      body: {
        ok: true,
        epoch: this.epoch,
        seq: this.seq,
        path: body.path,
        fingerprint: clip,
      },
    };
  }
}
