# Troubleshooting

Common issues and solutions for Producer Pal.

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
supports tool calling. Many local models (including some in LM Studio) don't
support tools.

## Connection Issues

- Ensure Producer Pal device is loaded and running in Ableton Live
- Check that port 3350 is not blocked by firewall
- For remote connections, verify your [tunnel](/installation/web-tunnels) is
  active

## MCP Server Not Found

- If using npx: Ensure Node.js 20+ is installed and accessible from your
  terminal
- Try running `npx -y producer-pal` manually to test if it works (it won't
  output anything, but it shouldn't error or exit until you ctrl+c)

## `npx` Is Running an Old Version

If you connect with `npx producer-pal` — used by Codex, Claude Code, and most
other CLI/MCP setups — your coding agent may fail with a **misleading error**,
often something like "cannot connect to MCP server", even though Ableton Live
and the Producer Pal device are running fine.

A common cause is a **stale `npx` version**. Despite its reputation for always
running the latest, `npx`:

- can reuse a **cached** copy of the package instead of re-downloading it, and
- skips the download entirely if you ever ran `npm install -g producer-pal` — it
  runs your global copy instead.

When the Producer Pal device has been upgraded but the `npx` bridge is still an
older version, the two may be incompatible, and the agent reports a generic
connection failure that doesn't point at the real problem.

**Fix — install the latest version explicitly:**

```bash
npm install -g producer-pal@latest
```

Then restart your AI app. This updates (or creates) a global install that
`npx producer-pal` will use, so you're running a known-current version.

::: tip Running from a project folder?

If you launch your agent from a folder that has its own local `producer-pal`
install (in `node_modules`), `npx` uses that copy instead of the global one.
Update it there, or run from a folder without one.

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

On current versions of Producer Pal, only library/plugin browsing is affected —
connecting to Ableton and the other tools keep working.

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
