// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { act } from "@testing-library/preact";
import { expect, vi } from "vitest";

type MockFn = ReturnType<typeof vi.fn>;

/** A promise that settles when the test says so. */
export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (err: Error) => void;
}

/**
 * Make a promise the test settles by hand, to park a connect() on an await.
 * @returns The promise and its resolve/reject triggers
 */
export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

/** The slice of a voice hook the stale-connect tests drive. */
export interface TalkControls {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

/**
 * Press Talk and let it run until it parks on its gated await.
 * @param controls - The hook's connect/disconnect
 * @returns The in-flight connect (boxed so awaiting this doesn't wait on it)
 */
export async function startTalk(
  controls: TalkControls,
): Promise<{ connecting: Promise<void> }> {
  let connecting!: Promise<void>;

  await act(async () => {
    connecting = controls.connect();
    await new Promise((r) => setTimeout(r, 0));
  });

  return { connecting };
}

/**
 * Drop the current session (New chat / select / delete), then Talk again and
 * wait for that second connect to finish.
 * @param controls - The hook's connect/disconnect
 */
export async function disconnectThenTalkAgain(
  controls: TalkControls,
): Promise<void> {
  await act(() => controls.disconnect());
  await act(() => controls.connect());
}

/**
 * Let a parked, now-stale connect resume and run to its end.
 * @param connecting - The parked connect, from startTalk
 * @param resume - Settles whatever the connect is parked on
 */
export async function resumeStaleConnect(
  connecting: Promise<void>,
  resume: () => void,
): Promise<void> {
  await act(async () => {
    resume();
    await connecting;
  });
}

/**
 * Talk parked on MCP setup, drop it, Talk again to completion, then let the
 * first resume. It must close its own MCP client, leave the second's alone,
 * and the second's client must still be the one Stop closes.
 * @param opts - The scenario's pieces
 * @param opts.result - The renderHook result for the voice hook
 * @param opts.resolveFirstMcp - Settles the parked MCP setup with a client
 *   whose close is the given spy
 * @param opts.secondClose - Close spy of the second Talk's MCP client
 */
export async function expectStaleMcpClosedOnlyItsOwn(opts: {
  result: { current: TalkControls & { status: string } };
  resolveFirstMcp: (close: MockFn) => void;
  secondClose: MockFn;
}): Promise<void> {
  const { result, resolveFirstMcp, secondClose } = opts;
  const firstClose = vi.fn(async () => {});
  const { connecting: first } = await startTalk(result.current);

  await disconnectThenTalkAgain(result.current);
  expect(result.current.status).toBe("connected");

  await resumeStaleConnect(first, () => resolveFirstMcp(firstClose));

  expect(firstClose).toHaveBeenCalledTimes(1);
  expect(secondClose).not.toHaveBeenCalled();
  expect(result.current.status).toBe("connected");

  await act(() => result.current.disconnect());
  expect(secondClose).toHaveBeenCalledTimes(1);
}
