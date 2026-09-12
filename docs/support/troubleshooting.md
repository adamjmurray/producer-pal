# Troubleshooting

## AI Won't Use Producer Pal

### Verify Your Setup

- Producer Pal Max for Live device is running in Ableton Live and displays
  "Producer Pal Running"
- Producer Pal tools are enabled in your AI app (most apps let you view
  available MCP tools/extensions)
- If either was missing, start a new conversation. If that doesn't work, restart
  your AI app completely.

### If AI Claims It Can't Interact with Ableton Live

1. Ask "what tools do you have?"
2. Verify it lists Producer Pal tools like `ppal-connect`
3. Say "call your ppal-connect tool"

Once ppal-connect is called, Producer Pal should work. If "connect to ableton"
doesn't trigger it, try:

- "connect to ableton with your tools"
- "connect to ableton with your ppal-connect tool"

If tools are visible but the AI won't call them, check you're using a model that
supports tool calling. Many local models (including some in Bionic) don't
support tools.

## Connection Issues

- Ensure Producer Pal device is loaded and running in Ableton Live
- Check that port 3350 is not blocked by firewall
- For remote connections, verify your [tunnel](/installation/web-tunnels) is
  active

## MCP Server Not Found

- If using npx: Ensure Node.js 20+ is installed and accessible from your
  terminal
- Try running `npx -y producer-pal@latest` manually to test if it works (it
  won't output anything, but it shouldn't error or exit until you ctrl+c)

## `npx` Is Running an Old Version

If you connect with `npx producer-pal` (used by Codex, Claude Code, and most
other CLI/MCP setups), your coding agent may fail with a **misleading error**,
often something like "cannot connect to MCP server", even though Ableton Live
and the Producer Pal device are running fine. When the device has been upgraded
but the bridge is still an older version, the two may be incompatible, and the
agent reports a generic connection failure that doesn't point at the real
problem.

The cause is usually **an old copy of `producer-pal` already on your machine**.
Before `npx` fetches anything, it looks for a `producer-pal` command that is
already installed, and runs that instead, with no version check. It finds one
if:

- you ever ran `npm install -g producer-pal`, or
- you launch your agent from a project folder with its own `producer-pal` in
  `node_modules`.

**Fix: pin `@latest` in your MCP config.**

```json
{
  "command": "npx",
  "args": ["-y", "producer-pal@latest"]
}
```

A version tag makes `npx` skip the already-installed copy and resolve against
npm every time. Then restart your AI app.

If you do have a stale global install, you can also remove it so nothing shadows
`npx` again:

```bash
npm uninstall -g producer-pal
```

::: tip Don't fix this with `npm install -g producer-pal@latest`

It works today and breaks at the next release. You're back to an old global copy
shadowing `npx`, which is the problem in the first place. Pin `@latest` in the
config instead.

:::

## Tools Not Appearing

- Toggle the Producer Pal device off and on in Live
- Restart your AI interface
- Check the Max console for error messages (right-click the device's title bar
  and choose "Open Max Window")

## Library Features Require Live 12.4+

Producer Pal's library and plugin browsing (the `ppal-library` tool) requires
**Ableton Live 12.4 or later**. It relies on capabilities in the version of Max
that ships with Live 12.4 and up.

Symptoms on older Live versions:

- The AI reports it can't read your Live library and says you need Live 12.4 or
  later.
- On older Producer Pal versions the device may fail to start, with an error
  mentioning `node:sqlite` in the Max console.

What to do:

- **Update Ableton Live to 12.4 or later** (recommended).
- **If you use a standalone Max** (for example, for Max development) instead of
  the Max bundled with Live, make sure it is updated to the latest version. You
  can also turn off the "Use Max Application" option in Live's preferences so
  Live uses its own bundled Max.

On current versions of Producer Pal, only library/plugin browsing is affected.
Connecting to Ableton and the other tools keep working.

## After Upgrading

If Producer Pal stops working after installing a new version:

- **Claude Desktop users:** Make sure you uninstalled the old extension before
  installing the new one
- **All users:** Verify you replaced the `.amxd` device (and the `.mcpb`
  extension if applicable for your installation)
- Try deleting and re-adding the Producer Pal device in Ableton Live
- Restart your AI app completely
- Start a fresh conversation

## Still Need Help?

If these steps didn't resolve your issue, check the
[list of open issues](https://github.com/adamjmurray/producer-pal/issues) or
[file a new issue](https://github.com/adamjmurray/producer-pal/issues/new/choose).
You can also ask in
[GitHub Discussions](https://github.com/adamjmurray/producer-pal/discussions).
