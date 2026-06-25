// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Pure helpers for conversation branching (edit/retry forks).
 *
 * Each branch is a separate conversation record linked by a parent pointer:
 * a fork stores `forkParentId` (the record it diverged from — its "trunk") and
 * `forkedAtIndex` (the UI message index the ‹ n/m › arrows sit under). A
 * "divergence set" is identified by the pair (trunkId, forkedAtIndex): its
 * members are the trunk plus every fork that shares that trunk and index.
 *
 * These functions work off lightweight records so they can run against the
 * conversation summary list already held in memory, with no extra DB reads.
 */

/** Minimal fields needed to reason about branch relationships. */
export interface BranchRecord {
  id: string;
  forkParentId?: string;
  forkedAtIndex?: number;
  createdAt: number;
  updatedAt: number;
  /** Whether this record is bookmarked. Lets a bookmarked family member be
   *  preferred as the representative so it isn't hidden behind a newer fork. */
  bookmarked?: boolean;
}

/** A point in the active conversation that has sibling branches to page through. */
export interface BranchPoint {
  /** UI message index to render the ‹ n/m › arrows under. */
  anchorIndex: number;
  /** Sibling conversation ids in display order (trunk first, then forks by age). */
  siblingIds: string[];
  /** Position of the active conversation within {@link siblingIds} (0-based). */
  currentIndex: number;
}

/**
 * Branch-navigation state for the active conversation: the divergence points
 * with sibling branches to page through, plus the handler that switches to a
 * sibling. Bundled so the chat screen can thread it down as a single prop.
 */
export interface BranchNavState {
  points: BranchPoint[];
  /** Switch the active conversation to the given sibling branch. */
  onSwitch: (siblingId: string) => void | Promise<void>;
}

/**
 * Collapse each branch family down to a single representative for list display,
 * so forks don't each get their own row. Records sharing a root (followed up the
 * `forkParentId` chain) are one family. The representative is chosen by, in
 * order of precedence:
 *   1. the active conversation (`activeId`) — so the sidebar highlights the
 *      sibling you're viewing, even when it isn't the most recent one;
 *   2. a bookmarked member — so a bookmarked trunk stays visible (and editable)
 *      instead of hiding behind a newer unbookmarked fork;
 *   3. the most-recently-updated member (ties broken by newest creation).
 * Families are ordered by their most recent member, so promoting an older active
 * or bookmarked representative never moves the row. Records with no branch links
 * pass through unchanged.
 * @param items - Conversation summaries (or any records carrying branch fields)
 * @param activeId - Id of the active conversation, promoted to represent its
 *   family when present (defaults to none)
 * @returns One record per family, ordered by family recency descending
 */
export function collapseBranchFamilies<T extends BranchRecord>(
  items: T[],
  activeId: string | null = null,
): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  // root -> chosen representative plus the family's most recent updatedAt, kept
  // together so ordering by family recency doesn't move the row when an older
  // active/bookmarked member is promoted to represent it.
  const families = new Map<string, { rep: T; latest: number }>();

  for (const item of items) {
    const root = branchRootId(item.id, byId);
    const family = families.get(root);

    if (!family) {
      families.set(root, { rep: item, latest: item.updatedAt });
    } else {
      family.latest = Math.max(family.latest, item.updatedAt);

      if (preferRepresentative(item, family.rep, activeId)) family.rep = item;
    }
  }

  return [...families.values()]
    .sort((a, b) => b.latest - a.latest)
    .map((family) => family.rep);
}

/**
 * Pick the trunk a new fork should attach to. Re-forking a record at the same
 * point it already diverged joins that existing set (sharing the trunk), so
 * repeated edits/retries of one turn accumulate as siblings. Forking at any
 * other point makes the source itself the trunk of a fresh set.
 * @param source - The conversation being forked from
 * @param source.id - The source conversation's id
 * @param source.forkParentId - The source's own trunk id, if it is itself a fork
 * @param source.forkedAtIndex - The source's own fork-point index, if a fork
 * @param anchorIndex - The fork-point message index of the new fork
 * @returns The id the new fork should store as its `forkParentId`
 */
export function deriveForkParentId(
  source: { id: string; forkParentId?: string; forkedAtIndex?: number },
  anchorIndex: number,
): string {
  return source.forkParentId != null && source.forkedAtIndex === anchorIndex
    ? source.forkParentId
    : source.id;
}

/**
 * Compute the branch points visible while viewing one conversation: the set it
 * belongs to as a fork, plus any sets it anchors as a trunk. Points with fewer
 * than two members (no real choice) are omitted.
 * @param activeId - Id of the conversation currently being viewed
 * @param items - All conversation summaries (uncollapsed, so every sibling is present)
 * @returns Branch points sorted by anchor index, one per divergence message
 */
export function computeBranchPoints<T extends BranchRecord>(
  activeId: string,
  items: T[],
): BranchPoint[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const active = byId.get(activeId);

  if (!active) return [];

  const byAnchor = new Map<number, BranchPoint>();

  // The set this conversation belongs to as a fork of some trunk.
  if (active.forkParentId != null && active.forkedAtIndex != null) {
    addBranchPoint(
      byAnchor,
      active.forkedAtIndex,
      active.forkParentId,
      activeId,
      items,
    );
  }

  // Sets this conversation anchors as a trunk (others forked from it).
  for (const index of trunkForkIndexes(activeId, items)) {
    addBranchPoint(byAnchor, index, activeId, activeId, items);
  }

  return [...byAnchor.values()].sort((a, b) => a.anchorIndex - b.anchorIndex);
}

/**
 * Every id in the branch families the given seeds belong to: each record whose
 * `forkParentId` chain bottoms out at the same root as some seed. Used to shield
 * a whole family from the conversation-cap LRU when saving a new branch, so
 * trimming to make room for the fork can't silently evict a sibling and orphan
 * that family's ‹ n/m › navigation. The earlier protection covered only the
 * trunk and immediate source, leaving other siblings exposed.
 * @param seedIds - Known family-member ids (a fork's trunk and immediate source)
 * @param items - All conversation summaries (uncollapsed, every sibling present)
 * @returns Set of every id sharing a seed's family root (seeds always included)
 */
export function branchFamilyIds<T extends BranchRecord>(
  seedIds: readonly string[],
  items: T[],
): ReadonlySet<string> {
  const byId = new Map(items.map((item) => [item.id, item]));
  const roots = new Set(seedIds.map((id) => branchRootId(id, byId)));
  const family = new Set<string>(seedIds);

  for (const item of items) {
    if (roots.has(branchRootId(item.id, byId))) family.add(item.id);
  }

  return family;
}

// --- Helpers below main exports ---

/**
 * Whether `candidate` should replace `current` as its family's representative.
 * The active conversation always wins (so its row highlights); otherwise a
 * bookmarked member outranks an unbookmarked one (so a bookmarked trunk isn't
 * hidden behind a newer fork); ties fall back to {@link isNewer}.
 * @param candidate - Member being considered
 * @param current - Current representative for the family
 * @param activeId - Active conversation id, or null
 * @returns True if `candidate` should become the representative
 */
function preferRepresentative<T extends BranchRecord>(
  candidate: T,
  current: T,
  activeId: string | null,
): boolean {
  if (candidate.id === activeId) return true;
  if (current.id === activeId) return false;

  const candidateBookmarked = candidate.bookmarked ?? false;
  const currentBookmarked = current.bookmarked ?? false;

  if (candidateBookmarked !== currentBookmarked) return candidateBookmarked;

  return isNewer(candidate, current);
}

/**
 * Whether record `a` should outrank `b` as a family representative: newer
 * `updatedAt`, with ties broken by newer `createdAt` so the result is stable and
 * a freshly forked branch (created after its original, often within the same
 * millisecond) wins over the original it diverged from.
 * @param a - Candidate record
 * @param b - Current representative
 * @returns True if `a` is more recent than `b`
 */
function isNewer(a: BranchRecord, b: BranchRecord): boolean {
  return a.updatedAt !== b.updatedAt
    ? a.updatedAt > b.updatedAt
    : a.createdAt > b.createdAt;
}

/**
 * Follow a record's `forkParentId` chain to the topmost id. A referenced-but-
 * missing parent (its trunk was deleted) still yields that id, so orphaned
 * siblings keep collapsing together. Cycles are guarded.
 * @param id - Starting record id
 * @param byId - Lookup of all records by id
 * @returns The family root id (may be a referenced id whose record is gone)
 */
function branchRootId(id: string, byId: Map<string, BranchRecord>): string {
  let current = id;
  const seen = new Set([id]);

  while (true) {
    const parent = byId.get(current)?.forkParentId;

    if (parent == null || seen.has(parent)) return current;

    seen.add(parent);
    current = parent;
  }
}

/**
 * Distinct fork-point indexes for forks that name `trunkId` as their parent.
 * @param trunkId - Candidate trunk id
 * @param items - All records
 * @returns Set of `forkedAtIndex` values of direct forks
 */
function trunkForkIndexes<T extends BranchRecord>(
  trunkId: string,
  items: T[],
): Set<number> {
  const indexes = new Set<number>();

  for (const item of items) {
    if (item.forkParentId === trunkId && item.forkedAtIndex != null) {
      indexes.add(item.forkedAtIndex);
    }
  }

  return indexes;
}

/**
 * Build and record a branch point for one divergence set, keyed by anchor index
 * so a malformed overlap keeps only the larger set instead of stacking arrows.
 * @param byAnchor - Accumulator keyed by anchor message index
 * @param anchorIndex - UI message index the arrows sit under
 * @param trunkId - Trunk id of the divergence set
 * @param activeId - Id of the conversation being viewed (for the current position)
 * @param items - All records
 */
function addBranchPoint<T extends BranchRecord>(
  byAnchor: Map<number, BranchPoint>,
  anchorIndex: number,
  trunkId: string,
  activeId: string,
  items: T[],
): void {
  const siblingIds = siblingsOfSet(trunkId, anchorIndex, items);
  const currentIndex = siblingIds.indexOf(activeId);

  if (siblingIds.length < 2 || currentIndex < 0) return;

  const existing = byAnchor.get(anchorIndex);

  if (!existing || siblingIds.length > existing.siblingIds.length) {
    byAnchor.set(anchorIndex, { anchorIndex, siblingIds, currentIndex });
  }
}

/**
 * Ordered member ids of one divergence set: the trunk first (when it still
 * exists), then its forks at that index, oldest first.
 * @param trunkId - Trunk id of the set
 * @param index - Fork-point index defining the set
 * @param items - All records
 * @returns Ordered sibling ids
 */
function siblingsOfSet<T extends BranchRecord>(
  trunkId: string,
  index: number,
  items: T[],
): string[] {
  const forks = items
    .filter(
      (item) => item.forkParentId === trunkId && item.forkedAtIndex === index,
    )
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((item) => item.id);
  const trunkExists = items.some((item) => item.id === trunkId);

  return trunkExists ? [trunkId, ...forks] : forks;
}
