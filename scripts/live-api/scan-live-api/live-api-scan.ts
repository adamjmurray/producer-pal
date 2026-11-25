// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

export interface InfoEntry {
  kind: string;
  name: string;
  type?: string;
}

export interface ScanResult {
  path: string;
  label: string;
  typeName: string;
  rawInfo: string;
  entries: InfoEntry[];
}

export interface ScanContext {
  baseUrl: string;
  results: ScanResult[];
  seenTypes: Set<string>;
}

/** The `ppal-live-api` result: one entry in `results` per operation. */
export interface RawApiResult {
  path?: string;
  id: string;
  results: unknown[];
}

/**
 * Pull the `ppal-live-api` result out of a REST response body. The REST
 * default is parsed JSON, so `result` is the tool's `{ path?, id, results }`
 * object; an error comes back as `isError` with a string.
 * @param data - Parsed REST response body
 * @returns The tool result, or null when the call failed or has no results
 */
export function parseRawApiResponse(data: unknown): RawApiResult | null {
  const body = data as {
    result?: Partial<RawApiResult> | string | null;
  } | null;
  const result = body?.result;

  if (
    (data as { isError?: boolean } | null)?.isError ||
    result == null ||
    typeof result !== "object" ||
    !Array.isArray(result.results)
  ) {
    return null;
  }

  return result as RawApiResult;
}

/**
 * Call the raw live API via REST
 * @param baseUrl - Base URL of the Producer Pal server
 * @param path - Live API path
 * @param operations - Operations to execute
 * @returns The tool result, or null on failure
 */
export async function callRawApi(
  baseUrl: string,
  path: string,
  operations: Record<string, unknown>[],
): Promise<RawApiResult | null> {
  try {
    const res = await fetch(`${baseUrl}/api/tools/ppal-live-api`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, operations }),
    });

    if (!res.ok) {
      return null;
    }

    return parseRawApiResponse(await res.json());
  } catch {
    return null;
  }
}

/**
 * Get info for a Live API path
 * @param baseUrl - Base URL
 * @param path - Live API path
 * @returns Info string, or null if nothing exists at the path
 */
export async function getInfo(
  baseUrl: string,
  path: string,
): Promise<string | null> {
  const result = await callRawApi(baseUrl, path, [{ type: "info" }]);
  const info = result?.results[0];

  // Id "0" means no Live object is at the path.
  if (result == null || result.id === "0" || typeof info !== "string") {
    return null;
  }

  return info === "" ? null : info;
}

/**
 * Get a property value as a string. `get` returns an array of values; this
 * reads the first one and stringifies it.
 * @param baseUrl - Base URL
 * @param path - Live API path
 * @param property - Property name
 * @returns The first value, or null if it couldn't be read
 */
export async function getPropertyValue(
  baseUrl: string,
  path: string,
  property: string,
): Promise<string | null> {
  const result = await callRawApi(baseUrl, path, [{ type: "get", property }]);
  const values = result?.results[0];

  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  return String(values[0]);
}

/**
 * Parse an info string into structured entries
 * @param info - Raw info string
 * @returns Array of entries
 */
export function parseInfo(info: string): InfoEntry[] {
  const entries: InfoEntry[] = [];

  for (const line of info.split("\n")) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("id ") || trimmed === "done") {
      continue;
    }

    if (trimmed.startsWith("type ") || trimmed.startsWith("description ")) {
      continue;
    }

    const parts = trimmed.split(/\s+/);

    if (parts.length >= 2) {
      entries.push({
        kind: parts[0] as string,
        name: parts[1] as string,
        type: parts[2],
      });
    }
  }

  return entries;
}

/**
 * Get the type name from an info string
 * @param info - Raw info string
 * @returns Type name
 */
export function getTypeName(info: string): string {
  const match = /^type (\w+)/m.exec(info);

  return match ? (match[1] as string) : "Unknown";
}

/**
 * Scan a path and add to results if it's a new type
 * @param ctx - Scan context
 * @param path - Live API path
 * @param label - Human-readable label
 * @returns Whether a new type was discovered
 */
export async function scanPath(
  ctx: ScanContext,
  path: string,
  label: string,
): Promise<boolean> {
  const info = await getInfo(ctx.baseUrl, path);

  if (!info) {
    return false;
  }

  const typeName = getTypeName(info);

  if (ctx.seenTypes.has(typeName)) {
    return false;
  }

  ctx.seenTypes.add(typeName);
  ctx.results.push({
    path,
    label,
    typeName,
    rawInfo: info,
    entries: parseInfo(info),
  });

  return true;
}

/**
 * Format a single scan result into text lines
 * @param r - Scan result
 * @returns Array of text lines
 */
function formatResult(r: ScanResult): string[] {
  const lines: string[] = [];

  lines.push(`### ${r.typeName}`);
  lines.push(`Path: ${r.path}`);
  lines.push("");

  const children = r.entries.filter(
    (e) => e.kind === "children" || e.kind === "child",
  );
  const properties = r.entries.filter((e) => e.kind === "property");
  const functions = r.entries.filter((e) => e.kind === "function");

  if (children.length > 0) {
    lines.push("  Children:");

    for (const c of children) {
      const plural = c.kind === "children" ? " (list)" : "";

      lines.push(`    ${c.name}: ${c.type ?? "?"}${plural}`);
    }
  }

  if (properties.length > 0) {
    lines.push("  Properties:");

    for (const p of properties) {
      lines.push(`    ${p.name}: ${p.type ?? "?"}`);
    }
  }

  if (functions.length > 0) {
    lines.push("  Functions:");

    for (const f of functions) {
      lines.push(`    ${f.name}()`);
    }
  }

  return lines;
}

/**
 * Format all scan results into readable output text
 * @param results - Array of scan results
 * @returns Formatted text
 */
export function formatOutput(results: ScanResult[]): string {
  const lines: string[] = [
    "Live API Object Model Scan",
    `Date: ${new Date().toISOString()}`,
    `Types discovered: ${results.length}`,
    "",
    "=".repeat(70),
  ];

  for (const r of results) {
    lines.push("", ...formatResult(r), "", "-".repeat(70));
  }

  return lines.join("\n") + "\n";
}
