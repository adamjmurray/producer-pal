// device/mcp-server/create-mpc-server.mjs
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { addToolCaptureScene } from "./add-tool-capture-scene.mjs";
import { addToolDelete } from "./add-tool-delete.mjs";
import { addToolDuplicateClipSlot } from "./add-tool-duplicate-clip-slot.mjs";
import { addToolDuplicateClipToArranger } from "./add-tool-duplicate-clip-to-arranger.mjs";
import { addToolDuplicateScene } from "./add-tool-duplicate-scene.mjs";
import { addToolDuplicateTrack } from "./add-tool-duplicate-track.mjs";
import { addToolPlaySessionClip } from "./add-tool-play-session-clip.mjs";
import { addToolPlaySessionScene } from "./add-tool-play-session-scene.mjs";
import { addToolReadClip } from "./add-tool-read-clip.mjs";
import { addToolReadLiveSet } from "./add-tool-read-live-set.mjs";
import { addToolReadScene } from "./add-tool-read-scene.mjs";
import { addToolReadTrack } from "./add-tool-read-track.mjs";
import { addToolStopSessionClip } from "./add-tool-stop-session-clip.mjs";
import { addToolTransport } from "./add-tool-transport.mjs";
import { addToolWriteClip } from "./add-tool-write-clip.mjs";
import { addToolWriteLiveSet } from "./add-tool-write-live-set.mjs";
import { addToolWriteScene } from "./add-tool-write-scene.mjs";
import { addToolWriteTrack } from "./add-tool-write-track.mjs";

export function createMcpServer(callLiveApi) {
  const server = new McpServer({
    name: "Ableton Live Composition Assistant",
    version: "1.0.0",
  });

  addToolReadLiveSet(server, callLiveApi);
  addToolWriteLiveSet(server, callLiveApi);

  addToolReadTrack(server, callLiveApi);
  addToolWriteTrack(server, callLiveApi);

  addToolReadScene(server, callLiveApi);
  addToolWriteScene(server, callLiveApi);

  addToolReadClip(server, callLiveApi);
  addToolWriteClip(server, callLiveApi);

  addToolDelete(server, callLiveApi);

  addToolCaptureScene(server, callLiveApi);

  // TODO: Consolidate all duplicate tools
  addToolDuplicateClipSlot(server, callLiveApi);
  addToolDuplicateClipToArranger(server, callLiveApi);
  addToolDuplicateScene(server, callLiveApi);
  addToolDuplicateTrack(server, callLiveApi);

  // TODO: Consolidate all these into a transport tool
  addToolPlaySessionClip(server, callLiveApi);
  addToolPlaySessionScene(server, callLiveApi);
  addToolStopSessionClip(server, callLiveApi);
  addToolTransport(server, callLiveApi);

  return server;
}
