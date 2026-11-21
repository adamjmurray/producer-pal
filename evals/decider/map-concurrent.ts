// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Map items with at most `limit` calls in flight, keeping input order.
 *
 * @param items - Inputs
 * @param limit - Max concurrent calls
 * @param fn - Async mapper
 * @returns Outputs in input order
 */
export async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = Array.from({ length: items.length });
  let next = 0;

  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;

      out[i] = await fn(items[i] as T);
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, limit) }, () => worker()));

  return out;
}
