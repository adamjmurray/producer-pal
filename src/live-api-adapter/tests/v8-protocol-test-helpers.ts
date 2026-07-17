// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, vi } from "vitest";

// Shared harness for the two V8↔Node request protocols (node-request and
// code-exec). Both send `outlet(0, <message>, requestId, json)`, arm a Max Task
// as a timeout, and resolve a pending Promise when the reply arrives — so the
// Task stand-ins and outlet readers below are written once for both.

/**
 * Read the argument list of the most recent outlet call, asserting it is the
 * expected protocol message.
 *
 * @param message - Expected outlet message name (e.g. "node_request")
 * @returns The full outlet call arguments
 */
export function latestOutletCall(message: string): unknown[] {
  const outletMock = vi.mocked(globalThis.outlet);
  const call = outletMock.mock.calls.at(-1);

  expect(call?.[0]).toBe(0);
  expect(call?.[1]).toBe(message);

  return call as unknown[];
}

/**
 * Get the requestId from the most recent outlet call.
 *
 * @param message - Expected outlet message name
 * @returns The requestId argument
 */
export function latestOutletRequestId(message: string): string {
  return latestOutletCall(message)[2] as string;
}

/**
 * Parse the JSON payload from the most recent outlet call.
 *
 * @param message - Expected outlet message name
 * @returns The parsed payload
 */
export function latestOutletPayload<T>(message: string): T {
  return JSON.parse(latestOutletCall(message)[3] as string) as T;
}

/**
 * Install a non-auto-firing Task on globalThis that records each schedule(ms)
 * call into the supplied array. Returns a restore function the caller should
 * invoke in a finally block.
 *
 * @param scheduleCalls - Array that captures every schedule() ms value
 * @returns Restore function that puts the original globalThis.Task back
 */
export function installTrackingTask(scheduleCalls: number[]): () => void {
  class TrackingTask {
    schedule = (ms: number): void => {
      scheduleCalls.push(ms);
    };

    constructor(_callback: () => void) {}
  }

  return installTask(TrackingTask);
}

/**
 * Install a Task on globalThis that captures the callback so the test can
 * invoke it manually to simulate a fired timeout.
 *
 * @param captured - Array that receives each constructed Task's callback
 * @returns Restore function that puts the original globalThis.Task back
 */
export function installCapturingTask(captured: Array<() => void>): () => void {
  class CapturingTask {
    schedule = (_ms: number): void => {};

    constructor(callback: () => void) {
      captured.push(callback);
    }
  }

  return installTask(CapturingTask);
}

/**
 * Swap globalThis.Task for a stand-in class.
 *
 * @param TaskClass - Replacement Task constructor
 * @returns Restore function that puts the original globalThis.Task back
 */
function installTask(TaskClass: unknown): () => void {
  const g = globalThis as Record<string, unknown>;
  const originalTask = g.Task;

  g.Task = TaskClass;

  return () => {
    g.Task = originalTask;
  };
}
