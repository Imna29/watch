# Self-host on a VPS with our own realtime connection and a peer-to-peer Call

The app moves from Vercel to a VPS that runs the Nuxt server (with Nitro WebSockets carrying Watch Party sync, presence and Call setup), Postgres, and coturn as the Call's relay. Vercel could not hold these connections for this app: its WebSocket support needs Nitro v3 / Nuxt 5, closes connections every 300 seconds on the Hobby plan, and needs Redis when the two Viewers land on different instances. The managed alternative (Ably for realtime plus Cloudflare TURN or a video SDK such as Daily) added vendor accounts and usage caps for a two-person site. The Call is plain peer-to-peer WebRTC; coturn relays only when a direct connection fails.

## Consequences

- No preview deploys or Vercel Web Analytics.
- The VPS must expose UDP for coturn and serve HTTPS, since browsers only allow camera and microphone on secure origins.
