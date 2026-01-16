# claude.ai Web App

Use Producer Pal in your web browser with Anthropic's chat web app.

## Requirements

- [Ableton Live 12.3+](https://www.ableton.com/live/) with
  [Max for Live](https://www.ableton.com/live/max-for-live/)
- [Claude account](https://claude.ai)
- [Web tunnel](./web-tunnels) (e.g. Cloudflare or Pinggy)

## Installation Steps

### 1. Install the Max for Live Device

Download
[Producer_Pal.amxd](https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.amxd),
the Producer Pal Max for Live device, and add it to a MIDI track in Ableton
Live:

![Producer Pal device running in Ableton Live](/device-main-tab.png)

_It should display "Producer Pal Running" or something isn't working._

### 2. Set Up a Web Tunnel

Set up [a web tunnel](./web-tunnels) to expose your local Producer Pal server.

For example:

```bash
cloudflared tunnel --url http://localhost:3350
```

will give you a public URL such as `https://abc-xyz.trycloudflare.com`:

![Cloudflare web tunnel](/cloudflare-tunnel.png)

### 3. Configure Claude Web App

1. Go to
   [claude.ai settings → connectors](https://claude.ai/settings/connectors)
2. Add a custom connector with your tunnel URL + `/mcp`

   (e.g. `https://abc-xyz.trycloudflare.com/mcp`):

   ![Claude web connector setup](/claude-web-setup.png)

### 4. Verify Installation

You should see Producer Pal tools in Claude's "Search and Tools" menu (make sure
it's enabled when starting a conversation):

![Producer Pal tools in Claude web app](/claude-web-tool-list.png)

### 5. Start Using Producer Pal

1. Start a conversation with "connect to ableton"
2. Allow Producer Pal tools to be used when Claude tries to use them:

![Claude web tool permission prompt](/claude-web-permissions.png)

![Claude web successfully connected to Producer Pal](/claude-web-success.png)

## Troubleshooting

If it doesn't work, see the [Troubleshooting Guide](./troubleshooting).
