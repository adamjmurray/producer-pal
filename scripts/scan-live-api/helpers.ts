// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

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

/**
 * Call the raw live API via REST
 * @param baseUrl - Base URL of the Producer Pal server
 * @param path - Live API path
 * @param operations - Operations to execute
 * @returns Parsed result text or null
 */
export async function callRawApi(
  baseUrl: string,
  path: string,
  operations: Record<string, unknown>[],
): Promise<string | null> {
  try {
    const res = await fetch(`${baseUrl}/api/tools/ppal-raw-live-api`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, operations }),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as { result?: string; isError?: boolean };

    if (data.isError || !data.result) return null;

    return data.result;
  } catch {
    return null;
  }
}

/**
 * Get info for a Live API path
 * @param baseUrl - Base URL
 * @param path - Live API path
 * @returns Parsed info string or null
 */
export async function getInfo(
  baseUrl: string,
  path: string,
): Promise<string | null> {
  const result = await callRawApi(baseUrl, path, [{ type: "info" }]);

  if (!result) return null;

  const match = /result:"(.*?)\\ndone/.exec(result);

  if (!match) return null;

  return (match[1] as string).replaceAll("\\n", "\n").replaceAll("\\\\", "\\");
}

/**
 * Get a property value
 * @param baseUrl - Base URL
 * @param path - Live API path
 * @param property - Property name
 * @returns Result text or null
 */
export async function getProperty(
  baseUrl: string,
  path: string,
  property: string,
): Promise<string | null> {
  return await callRawApi(baseUrl, path, [{ type: "get", property }]);
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

    if (!trimmed || trimmed.startsWith("id ") || trimmed === "done") continue;

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

  if (!info) return false;

  const typeName = getTypeName(info);

  if (ctx.seenTypes.has(typeName)) return false;

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
