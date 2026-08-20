// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A stand-in Live Object Model, served over a stubbed fetch. The dumper's
// interesting parts — packing, slicing a flat result list back apart, telling
// an alias from a new object — are all wrong in ways a real Live Set would
// hide, because a real Set answers plausibly no matter how the reads are
// grouped. Here the answers are known.

import { vi } from "vitest";

export interface FakeObject {
  id: string;
  type: string;
  /** Raw `get()` answers, so arrays, exactly as Live returns them. */
  properties: Record<string, unknown[]>;
  /** The path Live reports, when it isn't the one that was asked for. */
  livePath?: string;
  /** An `info` listing of its own, for classes that share a type name. */
  info?: string;
}

export interface FakeLom {
  objects: Record<string, FakeObject>;
  /** LOM class to its `info` listing. */
  types: Record<string, string>;
  /** A second spelling that resolves to an existing path. */
  aliases?: Record<string, string>;
  /** Reads that throw, as `<path>:<property>`. */
  failing?: Set<string>;
}

export interface FakeLomCalls {
  /** Operations per request, in request order. */
  requests: number[];
}

interface FakeOp {
  type: string;
  property?: string;
  method?: string;
  value?: unknown;
}

/**
 * Build an `info` listing the way Live formats one.
 * @param type - The LOM class name
 * @param entries - Lines such as "property tempo float"
 * @returns The listing, with the noise Live puts around it
 */
export function fakeInfo(type: string, entries: string[]): string {
  return [
    "id 0",
    `type ${type}`,
    "description This is prose, and it wraps",
    "onto a second line that names nothing",
    ...entries,
    "done",
  ].join("\n");
}

/**
 * Stub global fetch with a server that answers ppal-live-api against a fake LOM.
 * @param lom - The object graph to serve
 * @returns A record of how the dumper batched its requests
 */
export function installFakeLom(lom: FakeLom): FakeLomCalls {
  const calls: FakeLomCalls = { requests: [] };
  let currentPath = "";
  let current: FakeObject | null = null;

  const runOp = (op: FakeOp): unknown => {
    switch (op.type) {
      case "set_path": {
        const asked = String(op.value);
        const resolved = lom.aliases?.[asked] ?? asked;

        current = lom.objects[resolved] ?? null;
        currentPath = current ? (current.livePath ?? resolved) : "";

        return currentPath;
      }

      case "get_property":
        return readWrapperProperty(current, currentPath, op.property);

      case "info": {
        if (!current) return "No object";

        return current.info ?? lom.types[current.type] ?? "No object";
      }

      case "exists":
        return current != null;

      case "get": {
        if (lom.failing?.has(`${currentPath}:${String(op.property)}`)) {
          throw new Error(`cannot read ${String(op.property)}`);
        }

        return current?.properties[String(op.property)] ?? [];
      }

      default:
        throw new Error(`fake LOM got an unexpected op: ${op.type}`);
    }
  };

  vi.stubGlobal("fetch", (_url: string, init: { body: string }) => {
    const { operations } = JSON.parse(init.body) as { operations: FakeOp[] };

    calls.requests.push(operations.length);

    let results: { result: unknown }[];

    try {
      results = operations.map((op) => ({ result: runOp(op) }));
    } catch (error) {
      // The real tool aborts the whole array on the first operation that
      // throws, which is what makes the halving retry necessary.
      return Promise.resolve(
        fakeResponse({ result: String(error), isError: true }),
      );
    }

    return Promise.resolve(
      fakeResponse({
        result: { path: currentPath, id: current?.id ?? "0", results },
        isError: false,
      }),
    );
  });

  return calls;
}

/**
 * Answer a read of the LiveAPI wrapper itself, not the object it points at.
 * @param current - The object currently targeted, or null
 * @param currentPath - The path Live would report
 * @param property - Which wrapper property was read
 * @returns The value, matching what Live reports for a missing object
 */
function readWrapperProperty(
  current: FakeObject | null,
  currentPath: string,
  property: string | undefined,
): unknown {
  switch (property) {
    // "0" and "" are what Live answers for a path that resolves to nothing.
    case "id":
      return current?.id ?? "0";

    case "type":
      return current?.type ?? "";

    case "path":
      return current ? currentPath : "";

    default:
      throw new Error(`fake LOM has no wrapper property ${String(property)}`);
  }
}

/**
 * Wrap a body the way the REST route does.
 * @param body - The parsed response body
 * @returns Something close enough to a fetch Response
 */
function fakeResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    // Cloned because the real response crosses a JSON boundary: without it the
    // dumper's redaction would reach back and edit the fake LOM in place.
    json: () => Promise.resolve(structuredClone(body)),
  } as Response;
}
