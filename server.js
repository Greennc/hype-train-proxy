/*
  Hype Train Proxy Server
  ========================
  - Connects to Twitch EventSub via WebSocket (no server needed for sub!)
  - Broadcasts hype train events to all connected SE overlay clients

  Setup:
  1. Go to https://dev.twitch.tv/console and create a new Application
  2. Copy your Client ID and generate a secret
  3. Get a User Access Token with scope: channel:read:hype_train
     (use https://twitchtokengenerator.com for easy setup)
  4. Fill in the config below
  5. Deploy to Railway, Render, or Fly.io (all have free tiers)
     - Set the env vars on the platform instead of hardcoding them here

  Deploy command: node server.js
*/

const WebSocket = require('ws');
const https = require('https');

/* ================================
   CONFIG — use environment variables
   on your host (Railway, Render, etc.)
================================ */

const config = {
  clientId:     process.env.TWITCH_CLIENT_ID     || 'YOUR_CLIENT_ID',
  accessToken:  process.env.TWITCH_ACCESS_TOKEN  || 'YOUR_USER_ACCESS_TOKEN',
  broadcasterId:process.env.TWITCH_BROADCASTER_ID|| 'YOUR_BROADCASTER_USER_ID',
  port:         process.env.PORT                 || 8080,
};

/* ================================
   OVERLAY CLIENTS
   SE overlays connect here via WS
================================ */

const wss = new WebSocket.Server({ port: config.port });
const overlayClients = new Set();

wss.on('connection', (ws) => {
  overlayClients.add(ws);
  console.log(`[Proxy] Overlay connected. Total: ${overlayClients.size}`);

  ws.on('close', () => {
    overlayClients.delete(ws);
    console.log(`[Proxy] Overlay disconnected. Total: ${overlayClients.size}`);
  });
});

function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const client of overlayClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

/* ================================
   TWITCH EVENTSUB VIA WEBSOCKET
   No public URL needed — Twitch pushes
   to us over a WS connection we open.
================================ */

let twitchSocket = null;
let sessionId = null;
let keepaliveTimer = null;

function connectToTwitch() {
  console.log('[Twitch] Connecting to EventSub WebSocket...');
  twitchSocket = new WebSocket('wss://eventsub.wss.twitch.tv/ws');

  twitchSocket.on('open', () => {
    console.log('[Twitch] EventSub WebSocket opened.');
  });

  twitchSocket.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    const type = msg.metadata?.message_type;

    // Reset keepalive on every message
    resetKeepalive();

    if (type === 'session_welcome') {
      sessionId = msg.payload.session.id;
      console.log('[Twitch] Session ID:', sessionId);
      subscribeToHypeTrain();
    }

    if (type === 'notification') {
      handleNotification(msg.payload);
    }

    if (type === 'session_reconnect') {
      console.log('[Twitch] Reconnect requested.');
      twitchSocket.close();
      connectToTwitch();
    }
  });

  twitchSocket.on('close', () => {
    console.warn('[Twitch] EventSub WS closed. Reconnecting in 5s...');
    clearTimeout(keepaliveTimer);
    setTimeout(connectToTwitch, 5000);
  });

  twitchSocket.on('error', (err) => {
    console.error('[Twitch] EventSub WS error:', err.message);
  });
}

function resetKeepalive() {
  clearTimeout(keepaliveTimer);
  // Twitch sends a keepalive every 10s; if we miss 2, reconnect
  keepaliveTimer = setTimeout(() => {
    console.warn('[Twitch] Keepalive timeout. Reconnecting...');
    twitchSocket.close();
  }, 25000);
}

/* ================================
   SUBSCRIBE TO HYPE TRAIN EVENTS
================================ */

function subscribeToHypeTrain() {
  const subscriptions = [
    'channel.hype_train.begin',
    'channel.hype_train.progress',
    'channel.hype_train.end',
  ];

  for (const subType of subscriptions) {
    const body = JSON.stringify({
      type: subType,
      version: '2',
      condition: { broadcaster_user_id: config.broadcasterId },
      transport: { method: 'websocket', session_id: sessionId },
    });

    const options = {
      hostname: 'api.twitch.tv',
      path: '/helix/eventsub/subscriptions',
      method: 'POST',
      headers: {
        'Client-Id': config.clientId,
        'Authorization': `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 202) {
          console.log(`[Twitch] Subscribed to ${subType}`);
        } else {
          console.error(`[Twitch] Failed to subscribe to ${subType}:`, data);
        }
      });
    });

    req.on('error', (err) => console.error('[Twitch] Subscription error:', err));
    req.write(body);
    req.end();
  }
}

/* ================================
   HANDLE INCOMING HYPE TRAIN EVENTS
================================ */

function handleNotification(payload) {
  const eventType = payload.subscription?.type;
  const event = payload.event;

  if (eventType === 'channel.hype_train.begin') {
    console.log(`[HypeTrain] Started at level ${event.level} — ${event.progress}/${event.goal}`);
    broadcast({
      type: 'hypeTrainBegin',
      level: event.level,
      progress: event.progress,
      goal: event.goal,
    });
  }

  if (eventType === 'channel.hype_train.progress') {
    console.log(`[HypeTrain] Level ${event.level} — ${event.progress}/${event.goal}`);
    broadcast({
      type: 'hypeTrainProgress',
      level: event.level,
      progress: event.progress,
      goal: event.goal,
    });
  }

  if (eventType === 'channel.hype_train.end') {
    console.log('[HypeTrain] Ended.');
    broadcast({ type: 'hypeTrainEnd' });
  }
}

/* ================================
   START
================================ */

connectToTwitch();
console.log(`[Proxy] Overlay WebSocket server listening on port ${config.port}`);
