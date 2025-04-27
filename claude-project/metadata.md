Name: AI Music Composition Assistant

---

Description: Let Claude be your music composition assistant when making music in Ableton Live.

---

Project Instructions:

Ultimate Goal: Build an AI music composition assistant for Ableton Live by implementing a custom MCP (model context protocol) server that integrates with the Live API using Max for Live and Node for Max.

Supporting Goal: Maintain a markdown artifact for breaking down the needed project implementation tasks into actionable steps, and tracking progress toward the ultimate goal.

Current Project Phase: We are at the begging of the R&D proof-of-concept phase, attempting to build the minimum viable product (MVP). Current focus is brainstorming, high level feature design, technical planning, and technical viability analysis.

Note: We are working through the Project Plan (see the project resources) over many conversations, which means in almost every conversation, the conversation's goal is not to achieve the full project plan or even any particular step of the plan. Instead, the goal of any conversation is to make progress towards the plan in some very specific way. The user will give you guidance about this at the start of each conversation. Don't assume the goal of a conversation. Ask for clarification if needed.

Useful resources: Consult the "Trusted online resources" project resource for web pages with highly relevant information for the implementation of this project. You may also trust any web page on the same domain as these trusted online resources.

Context and Constraints:

- Minimize dependencies to reduce complexity and maintenance
- Use TypeScript (or JavaScript as a fallback) wherever possible. Avoid Python and other programming languages.
- We are using the 2025-03-26 version of the model context protocol (MCP). Project resources include relevant specs with up-to-date info
- The UI for interacting with the AI will be the Claude Desktop app
- All functionality within Live should be provided by a single Max for Live device
- The MCP server must communicate over SSE (Server-Sent Events) using HTTP
- Claude Desktop requires mcp-proxy to bridge between stdio and SSE
- We are using Live 12.2 and Max 9
- We are using Node.js 23 with native TypeScript support, including the `--experimental-transform-types` option that allows for use of TypeScript enums and other "non-erasable" syntax (see https://nodejs.org/docs/latest/api/typescript.html#type-stripping). It has been installed via Homebrew on macOS, with the executable located at `/opt/homebrew/bin/node`
- We do not want to setup any build process. Leverage the native TypeScript support and keep things simple.
- In order to use Node.js 23 in Node for Max with full TypeScript support, we must create the Max object with the attributes `@node_bin_path /opt/homebrew/bin/node @npm_bin_path /opt/homebrew/bin/npm options --experimental-transform-types`
- Node for Max will not load a `.ts` file as the entry point. We must load a .mjs file and can then `import "./other-code.ts";` from there to bootstrap all the TypeScript code.
- The path to the sourcecode is `/Users/adammurray/workspace/ableton-live-composition-assistant/src`
- The TypeScript MCP SDK was installed with `npm install @modelcontextprotocol/sdk`
- Type definitions were installed with `npm i --save-dev @types/node`
- The `package.json` was setup with `"type": "module",` so we can import from the entry script
- Claude Desktop is configured via `claude_desktop_config.json` (editable from Developer Settings) and uses the syntax:

```
{
  "mcpServers": {
    "{serverName}": {
      "command": "/opt/homebrew/bin/node",
      "args": [
        "--experimental-transform-types",
        "/Users/adammurray/workspace/ableton-live-composition-assistant/src/.../server.ts"
      ]
    }
  }
}
```
