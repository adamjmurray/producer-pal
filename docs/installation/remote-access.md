# Remote Access

Reach Producer Pal from somewhere other than Live's computer: another computer
on your network, or a chat website (claude.ai, ChatGPT, Le Chat) through a web
tunnel.

## Local Networks

For studios, classrooms, or performances on a local network, you don't need a
tunnel. Producer Pal has no authentication, so anyone on the same network can
reach it at the default port. You can customize the port number in the Producer
Pal device settings (default: 3350), which reduces the chance of accidental
discovery but is not real access control. Update the `:3350` in your AI
connection settings if you change it in the Producer Pal Max for Live device.

### Chat From a Phone or Another Computer

1. Connect the phone or other computer to the same Wi-Fi network as Live's
   computer.
2. Find the IP address of Live's computer. On a Mac: System Settings → Wi-Fi →
   Details → TCP/IP. On Windows: Settings → Network & internet → Wi-Fi → your
   network.
3. In the phone's browser, open `http://<that address>:3350`, for example
   `http://192.168.1.20:3350`.
4. Set up the AI in the chat's settings. Each browser keeps its own settings, so
   paste your API key again.

Some things only work on Live's computer: voice mode, and device settings like
small model mode. For local AI, `localhost` means the phone itself, so use the
address of the computer running the AI (see
[the user guide](/guide/chat-ui#local-ai-settings-ollama-bionic)).

## Web Chat

Use Producer Pal from a provider's chat website. Websites can't reach Live on
your computer, so each one needs a [web tunnel](#web-tunnels) first.

<!--@include: ../_partials/web-chat-warning.md-->

| Web App                      | Provider  | Cost                                      |
| ---------------------------- | --------- | ----------------------------------------- |
| [claude.ai](./claude-web)    | Anthropic | Claude account (subscription recommended) |
| [ChatGPT](./chatgpt-web)     | OpenAI    | Subscription (for advanced settings)      |
| [Le Chat](./mistral-le-chat) | Mistral   | Mistral account                           |

The AI is the same as in the desktop apps. The tradeoff is the tunnel: more
setup, and Live is reachable by anyone with the link.

## Web Tunnels

A tunnel gives your Producer Pal a public web address.

::: danger Security Warning

Producer Pal has no authentication. Anyone with your tunnel URL can control
Ableton Live. Keep the URL secret and only share with trusted collaborators. If
someone discovers it, restart your tunnel to get a new URL.

:::

### Cloudflare Quick Tunnels (Recommended)

- No account needed to get started
- Randomized domains so you can restart if one leaks
- Install: `brew install cloudflared` (macOS) or
  [check the website for install instructions](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/)
- Run: `cloudflared tunnel --url http://localhost:3350`

### Pinggy

- No installation required on macOS
- Run: `ssh -R 80:localhost:3350 a.pinggy.io`
- Free tier limited to 60 minutes,
  [check the website for more info](https://pinggy.io/)

### ngrok

::: warning Persistent Domain

ngrok gives a single persistent domain to all free accounts on sign-up, which,
if leaked, can't be changed. For this reason, it's only recommended for paying
ngrok customers.

:::

- Install: `brew install ngrok` (macOS) or
  [check the website for install instructions](https://ngrok.com)
- Run: `ngrok http http://localhost:3350`
