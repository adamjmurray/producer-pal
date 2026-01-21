# ChatGPT Web App

Use Producer Pal in your web browser with OpenAI's chat web app.

## Requirements

- [Ableton Live 12.3+](https://www.ableton.com/live/) with
  [Max for Live](https://www.ableton.com/live/max-for-live/)
- [ChatGPT account](https://chatgpt.com) (at the time of writing, a paid
  subscription is required to access the advanced settings needed for this to
  work)
- [Web tunnel](./web-tunnels) (e.g. Cloudflare or Pinggy)

## Installation Steps

### 1. Install the Max for Live Device

Download
[Producer_Pal.amxd](https://github.com/adamjmurray/producer-pal/releases/latest/download/Producer_Pal.amxd),
the Producer Pal Max for Live device, and add it to a MIDI track in Ableton
Live:

<img src="/device-main-tab.png" alt="Producer Pal device running in Ableton Live" width="375"/>

_It should display "Producer Pal Running" or something isn't working._

### 2. Set Up a Web Tunnel

Set up [a web tunnel](./web-tunnels) to expose your local Producer Pal server.

For example:

```bash
cloudflared tunnel --url http://localhost:3350
```

will give you a public URL such as `https://abc-xyz.trycloudflare.com`:

![Cloudflare web tunnel](/cloudflare-tunnel.png)

### 3. Enable Developer Mode

Go to
[ChatGPT → Settings → Apps & Connectors → Advanced](https://chatgpt.com/#settings/Connectors/Advanced)
and enable Developer Mode (this option might not appear for free accounts):

![ChatGPT developer mode settings](/chatgpt-setup.png)

### 4. Create Custom Connector

In the [Apps & Connectors](https://chatgpt.com/#settings/Connectors) settings,
create a custom connector:

- URL: Your tunnel URL + `/mcp` (e.g., `https://abc-xyz.trycloudflare.com/mcp`)
- No authentication
- Trust the app

![ChatGPT custom connector setup](/chatgpt-setup2.png)

### 5. Enable Tools in Conversation

Explicitly enable the Producer Pal tools for each conversation where you want to
use them:

![Enabling Producer Pal tools in ChatGPT](/chatgpt-enable-tools.png)

### 6. Start Using Producer Pal

Start a new chat with "connect to ableton with your producer pal tools" (note
that ChatGPT tends to need more nudging than "connect to ableton"):

![ChatGPT successfully connected to Producer Pal](/chatgpt-success.png)

## Troubleshooting

If it doesn't work, see the [Troubleshooting Guide](./troubleshooting).
