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
- For remote connections, verify your tunnel is active

## MCP Server Not Found

- If using npx: Ensure Node.js 20+ is installed and accessible from your
  terminal
- If using downloaded portal script: Verify the full path to
  `producer-pal-portal.js` is correct
- Try running `npx -y producer-pal` manually to test if it works (it won't
  output anything, but it shouldn't error or exit until you ctrl+c)

## Tools Not Appearing

- Toggle the Producer Pal device off and on in Live
- Restart your AI interface
- Check the Max console for error messages

## After Upgrading

If Producer Pal stops working after installing a new version:

- **Claude Desktop users:** Make sure you uninstalled the old extension before
  installing the new one
- **All users:** Verify you replaced both the `.amxd` device AND the portal/mcpb
  files (if applicable for your installation)
- Try deleting and re-adding the Producer Pal device in Ableton Live
- Restart your AI app completely
- Start a fresh conversation

## Getting Support

- Ask in
  [the discussion forum](https://github.com/adamjmurray/producer-pal/discussions/categories/questions)
- Report bugs in
  [the bug reports forum](https://github.com/adamjmurray/producer-pal/discussions/categories/bug-reports)
  or [issues list](https://github.com/adamjmurray/producer-pal/issues)
- Documentation: See
  [the README](https://github.com/adamjmurray/producer-pal#readme) and
  [developer documentation](https://github.com/adamjmurray/producer-pal/blob/main/DEVELOPERS.md).
