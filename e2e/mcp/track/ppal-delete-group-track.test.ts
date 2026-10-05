// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for ppal-delete on group tracks. Uses: e2e-test-set, where t9
 * "Parent" is a group whose only member is t10 "Child". Each test deletes a
 * copy of it, and takes every address from a result.
 *
 * Run with: npm run e2e:mcp -- ppal-delete-group-track
 */
import { describe, expect, it } from "vitest";
import {
  type CreateTrackResult,
  getToolErrorMessage,
  isToolError,
  parseToolResult,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers";
import { PARENT_TRACK } from "../e2e-test-set.ts";

const ctx = setupMcpTestContext();

interface DeleteResult {
  id?: string;
  deletedPath?: string;
  path?: string;
  ok?: false;
  detail?: string;
}

interface TrackRef {
  id: string;
  path: string;
}

/** A copy of the Parent group and the tracks inside it. */
interface GroupCopy {
  group: TrackRef;
  members: TrackRef[];
}

/**
 * The index in a track path.
 * @param path - A track path such as `t11`
 * @returns The index
 */
function indexOf(path: string): number {
  return Number(path.slice(1));
}

describe("ppal-delete of group tracks", () => {
  /**
   * Call a tool and let Live settle.
   * @param name - Tool name
   * @param args - Tool arguments
   * @returns The raw tool result
   */
  async function call(
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const result = await ctx.client!.callTool({ name, arguments: args });

    await sleep(100);

    return result;
  }

  /**
   * Read a track's id.
   * @param path - The track's path
   * @returns The track, by id and path
   */
  async function trackAt(path: string): Promise<TrackRef> {
    const track = parseToolResult<{ id: string }>(
      await call("ppal-read-track", { path }),
    );

    return { id: track.id, path };
  }

  /**
   * Copy the Parent group. The copy holds one member, a copy of Child.
   * @returns The copy
   */
  async function copyParent(): Promise<GroupCopy> {
    const parent = await trackAt(`t${PARENT_TRACK}`);
    const copy = parseToolResult<TrackRef>(
      await call("ppal-duplicate", { type: "track", id: parent.id }),
    );
    const member = await trackAt(`t${indexOf(copy.path) + 1}`);

    return { group: { id: copy.id, path: copy.path }, members: [member] };
  }

  /**
   * Copy the Parent group and add a second track inside it, first in line.
   * @returns The copy
   */
  async function copyParentWithTwoMembers(): Promise<GroupCopy> {
    const { group } = await copyParent();
    const insideAt = `t${indexOf(group.path) + 1}`;
    const added = parseToolResult<CreateTrackResult>(
      await call("ppal-create-track", { path: insideAt, name: "Extra Member" }),
    );

    return {
      group,
      members: [
        { id: added.id, path: insideAt },
        await trackAt(`t${indexOf(group.path) + 2}`),
      ],
    };
  }

  /**
   * Assert every track is gone, by reading each back.
   * @param tracks - The tracks that should no longer exist
   */
  async function expectGone(...tracks: TrackRef[]): Promise<void> {
    for (const { id } of tracks) {
      const result = await call("ppal-read-track", { id });

      expect(isToolError(result)).toBe(true);
    }
  }

  it("lists the tracks that went with a group track", async () => {
    const { group, members } = await copyParentWithTwoMembers();
    const deleted = parseToolResult<DeleteResult>(
      await call("ppal-delete", { type: "track", id: group.id }),
    );

    expect(deleted).toStrictEqual({
      id: group.id,
      deletedPath: group.path,
      detail: `also deleted the 2 tracks inside this group track: ${members
        .map(({ id, path }) => `${path} (id ${id})`)
        .join(", ")}`,
    });

    await expectGone(group, ...members);
  });

  it("skips the only track in a group and names the group to delete", async () => {
    const { group, members } = await copyParent();
    const [member] = members as [TrackRef];
    const result = await call("ppal-delete", {
      type: "track",
      id: member.id,
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toBe(
      `Error: Live won't delete the only track in a group track; delete group track ${group.path} (id ${group.id}) instead, which deletes both`,
    );

    expect((await trackAt(member.path)).id).toBe(member.id);
  });

  it("keeps the skip as an entry beside other targets", async () => {
    const { group, members } = await copyParent();
    const [member] = members as [TrackRef];
    const scratch = parseToolResult<CreateTrackResult>(
      await call("ppal-create-track", { path: "t+", name: "Scratch" }),
    );
    const data = parseToolResult<DeleteResult[]>(
      await call("ppal-delete", {
        type: "track",
        id: `${member.id},${scratch.id}`,
      }),
    );

    expect(data).toStrictEqual([
      {
        id: member.id,
        ok: false,
        detail: `Live won't delete the only track in a group track; delete group track ${group.path} (id ${group.id}) instead, which deletes both`,
      },
      { id: scratch.id, deletedPath: scratch.path },
    ]);
  });

  it.each<[string, (group: TrackRef, member: TrackRef) => object]>([
    ["ids, member first", (g, m) => ({ id: `${m.id},${g.id}` })],
    ["ids, group first", (g, m) => ({ id: `${g.id},${m.id}` })],
    ["paths", (g, m) => ({ path: `${g.path},${m.path}` })],
    ["an id and a path", (g, m) => ({ id: g.id, path: m.path })],
  ])(
    "deletes a group and its only member when both are named, by %s",
    async (_name, spell) => {
      const { group, members } = await copyParent();
      const [member] = members as [TrackRef];
      const data = parseToolResult<DeleteResult[]>(
        await call("ppal-delete", { type: "track", ...spell(group, member) }),
      );

      expect(data).toHaveLength(2);
      expect(data).toContainEqual({ id: group.id, deletedPath: group.path });
      expect(data).toContainEqual({ id: member.id, deletedPath: member.path });

      await expectGone(group, member);
    },
  );

  it("lists only the tracks the call did not name", async () => {
    const { group, members } = await copyParentWithTwoMembers();
    const [named, other] = members as [TrackRef, TrackRef];
    const data = parseToolResult<DeleteResult[]>(
      await call("ppal-delete", {
        type: "track",
        id: `${group.id},${named.id}`,
      }),
    );

    expect(data).toStrictEqual([
      {
        id: group.id,
        deletedPath: group.path,
        detail: `also deleted the track inside this group track: ${other.path} (id ${other.id})`,
      },
      { id: named.id, deletedPath: named.path },
    ]);

    await expectGone(group, named, other);
  });

  it("deletes one of several tracks in a group like any other track", async () => {
    const { group, members } = await copyParentWithTwoMembers();
    const [first, second] = members as [TrackRef, TrackRef];
    const deleted = parseToolResult<DeleteResult>(
      await call("ppal-delete", { type: "track", id: first.id }),
    );

    expect(deleted).toStrictEqual({ id: first.id, deletedPath: first.path });

    await expectGone(first);

    expect((await trackAt(group.path)).id).toBe(group.id);
    expect((await trackAt(first.path)).id).toBe(second.id);
  });
});
