# AI Music Composition Assistant Project

## Ultimate Goal

Build an AI music composition assistant for Ableton Live by implementing a custom MCP (model context protocol) server
that integrates with the Live API using Max for Live and Node for Max.

## Supporting Goals

### Primary Supporting Goal

Prototype code as directed by the user, to progress towards the ultimate goal.

### Secondary Supporting Goal

Maintain a versioned "Project Plan" markdown artifact for breaking down actionable steps and tracking progress toward
the ultimate goal. This artifact will be persisted to project resources. If the user asks you to open the project plan
for editing, copy the latest version of the project plan resource into the current conversation and increment the
version (either append v2, or increment v2 to v3, etc). Use this version suffix in the artifact name and title.

Similarly, maintain a versioned "Feature List" markdown artifact for feature prioritization and brainstorming (and other
project resources may appear over time that should also use versioned treatment).

## Current Project Phase

We have an end-to-end working prototype where Claude Desktop can call the Live API, and we're starting to build out
features.

We are working through the Project Plan over many conversations. The goal of each conversation is to make progress in
the plan in some very specific way guided by the user. Don't try to solve the whole project at once.

## Context and Constraints:

- Minimize dependencies to reduce complexity and maintenance
- Use TypeScript (or JavaScript as a fallback) wherever possible. Avoid Python and other programming languages.
- The repository root is `/Users/adammurray/workspace/ableton-live-composition-assistant`
- The path to the Max for Live device and source code is
  `/Users/adammurray/workspace/ableton-live-composition-assistant/device`
- The Node for Max and Max v8 code have different behaviors and requirements we need to follow:
  - In Node for Max, after bootstrapping the loader script `index.mjs`, we can `import` code with the modern ESM
    approach. Code can be organized into subfolders. TypeScript files must always be imported with the explicit `.ts`
    file extension.
  - In v8, we must use `require` and `module.exports` with the older CommonJS (CJS) approach. IMPORTANT: All code loaded
    by the v8 object must be in the same folder (`ableton-live-composition-assistant/device`). This is because v8 uses
    it's own custom loader for `require`, and it is very limited.
- We are using the 2025-03-26 version of the model context protocol (MCP).
- The UI for interacting with the AI will be the Claude Desktop app
- All functionality within Live should be provided by a single Max for Live device
- The MCP server must communicate over HTTP. We plan to use the new StreamableHttp transport because the
  [SSE transport is deprecated](https://github.com/modelcontextprotocol/typescript-sdk?tab=readme-ov-file#backwards-compatibility).
- Claude Desktop requires an adapter between its stdio transport and an HTTP MCP server. We use the library `mcp-proxy`
  for this.
- We are using Live 12.2 and Max 9
- We are using Node.js 23 with native TypeScript support, including the `--experimental-transform-types` option that
  allows for use of TypeScript enums and other "non-erasable" syntax (see
  https://nodejs.org/docs/latest/api/typescript.html#type-stripping). It has been installed via Homebrew on macOS, with
  the executable located at `/opt/homebrew/bin/node`
- We do not want to setup any build process. Leverage the native TypeScript support and keep things simple.
- In order to use Node.js 23 in Node for Max with full TypeScript support, we must create the Max object with the
  attributes
  `@node_bin_path /opt/homebrew/bin/node @npm_bin_path /opt/homebrew/bin/npm options --experimental-transform-types`
- Node for Max will not load a `.ts` file as the entry point. We must load a .mjs file and can then
  `import "./other-code.ts";` from there to bootstrap all the TypeScript code.
- The TypeScript MCP SDK was installed with `npm i @modelcontextprotocol/sdk`
- Other dependencies were installed `npm i zod express`
- Type definitions were installed with `npm i --save-dev @types/node @types/express @types/max-api`
- The `package.json` was setup with `"type": "module",` so we can import from the entry script
- We can try omitting `--experimental-transform-types` much of the time, and bring it back immediately as a potential
  solution if we're ever seeing errors about invalid syntax.
- For simplicity, don't worry about normal vs dev dependencies with `npm install` and `package.json`. Just install
  everything as a normal dependency in one command.
- You never need to mention things we'll install with `npm install` in prerequisites in this project, unless it's a new
  dependency we haven't seen before.
- Keep code commenting to a minimum by default unless something unusual requires explanation. Add more comments to
  resolve confusion or clarify answers to questions.
- When calling the Live API to get properties of an object like a Track or Clip, it seems that single item responses are
  usually (always?) arrays, so we need to do things like `track.get("name")?.[0]` to get the track name as a string. In
  cases where we are trying to compute a boolean, we can rely on JavaScript's type coercion to do things like
  `clip.get("looping") > 0`, but note that `clip.get("looping")` is actually either `[0]` or `[1]` and it's being
  converted to a number.
- source code files must always include the relative path to the file in a comment on the first line, so the context is
  clear when these files are added to project knowledge
- `package.json` must NOT set `"type"`. Setting this to `"module"` breaks the vitest test suite because it needs to
  require CJS code for the v8 object (which contains the tool implementations we are primarily interested in testing).
  Setting this to `"commonjs"` breaks the bootstrapping of the `mcp-server.mjs` module in the Node for Max object, which
  is needed to enable importing with modern style.

## Trusted online resources:

- Node for Max API docs: https://docs.cycling74.com/apiref/nodeformax/
- Max JS User Guide: https://docs.cycling74.com/userguide/javascript/
- Max JS API: https://docs.cycling74.com/apiref/js/
- Live API Overview: https://docs.cycling74.com/userguide/m4l/live_api_overview/
- Live Object Model: https://docs.cycling74.com/apiref/lom/
- Live Clip API: https://docs.cycling74.com/apiref/lom/clip/
- Live Track API: https://docs.cycling74.com/apiref/lom/track/
- My tutorial on the Live API: https://adammurray.link/max-for-live/v8-in-live/live-api/
- My tutorial on generating MIDI clips: https://adammurray.link/max-for-live/v8-in-live/generating-midi-clips/
- Ableton Live Manual: https://www.ableton.com/en/live-manual/12/
- MCP Documentation: https://modelcontextprotocol.io/
