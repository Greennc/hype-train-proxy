# Hype Train Thermometer — Full Setup Guide

## Overview

This solution has two parts:
1. **A proxy server** (`server.js`) that connects to Twitch's real-time EventSub API and broadcasts hype train events over WebSocket
2. **An updated StreamElements widget** (JS + Fields files) that listens to that WebSocket instead of relying on SE's broken hype train support

---

## Part 1: Set Up the Proxy Server

### Prerequisites
- A free account at [Railway.app](https://railway.app) (or Render.com)
- A [Twitch Developer Application](https://dev.twitch.tv/console/apps) — click "Register Your Application"
  - Name: anything (e.g. "HypeTrain Proxy")
  - OAuth Redirect URL: `http://localhost`
  - Category: Broadcasting Suite
- A Twitch User Access Token with the scope `channel:read:hype_train`
  - Easiest way: go to https://twitchtokengenerator.com, select that scope, log in as the broadcaster

### Get the Broadcaster User ID
Go to: `https://api.twitch.tv/helix/users?login=THEIR_TWITCH_USERNAME`
with headers `Client-Id` and `Authorization: Bearer YOUR_TOKEN`
Or just use: https://www.streamweasels.com/tools/convert-twitch-username-to-user-id/

### Deploy to Railway
1. Push this folder to a GitHub repo (just `server.js` and `package.json`)
2. Go to Railway.app → New Project → Deploy from GitHub
3. Set these environment variables in Railway's dashboard:
   ```
   TWITCH_CLIENT_ID=your_client_id
   TWITCH_ACCESS_TOKEN=your_user_access_token
   TWITCH_BROADCASTER_ID=the_broadcasters_numeric_id
   PORT=8080
   ```
4. Railway will give you a public URL like `https://hype-train-proxy.railway.app`
5. Your WebSocket URL will be: `wss://hype-train-proxy.railway.app`

---

## Part 2: Update the StreamElements Widget

### In StreamElements Custom Widget editor:

**JS tab** — replace entirely with contents of `3 - JS.txt`

**Fields tab** — replace entirely with contents of `4 - Fields.txt`

**HTML and CSS** — no changes needed (keep Davenport's originals)

**Data tab** — no changes needed

### Configure the Widget
1. In the SE Fields panel, paste your Railway WebSocket URL into the **"Proxy Server WebSocket URL"** field
2. Set **Test Mode** to `Off` when going live

---

## Color Reference (per client's spec)

| Level | Color         | Hex       | Effect    |
|-------|---------------|-----------|-----------|
| 1–3   | Yellow        | #FFD900   | None      |
| 4–7   | Light Orange  | #FFA600   | None      |
| 8–10  | Deep Orange   | #DD5A34   | None      |
| 11–16 | Red           | #DD1D1D   | None      |
| 17–20 | Dark Red      | #820000   | None      |
| 21+   | Darkest Red   | #2B0000   | Red glow  |

---

## How It Works (End to End)

```
Twitch API (EventSub)
       ↓ WebSocket (Twitch → proxy server)
  Proxy Server (Railway)
       ↓ WebSocket (proxy → SE overlay)
  StreamElements Overlay (in OBS browser source)
       ↓
  Thermometer fill updates in real time
```

The proxy server stays connected to Twitch at all times. When a hype train starts and progresses, Twitch pushes `channel.hype_train.progress` events. The proxy translates those and sends them to any connected SE overlays instantly.

---

## Troubleshooting

**Overlay isn't receiving data**
- Make sure Test Mode is set to Off in SE Fields
- Check that the WebSocket URL in Fields starts with `wss://` not `https://`
- Open browser devtools on the SE preview URL and look for `[HypeTrain]` log messages

**Server logs subscription errors**
- Your access token may have expired — regenerate at twitchtokengenerator.com
- Make sure you used the broadcaster's account to generate the token (not your own)

**Server crashes on Railway**
- Check Railway logs for errors
- Make sure all 3 environment variables are set correctly
