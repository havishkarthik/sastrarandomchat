# SastraChat 💬

Anonymous Omegle-style random chat application exclusively for Sastra University students.

## 🚀 Deploy & Get Your Shareable Link

Follow these steps once to get a live URL you can send to your friends.

> The app has two parts: a **backend server** (handles real-time chat) and a **frontend website** (what users see). Both must be deployed. Both have a **free** tier.

---

### Step 1 — Deploy the Backend on Render (free)

1. Go to **[render.com](https://render.com)** and sign up / log in with GitHub.
2. Click **"New +"** → **"Web Service"**.
3. Connect your **`havishkarthik/sastrarandomchat`** GitHub repository.
4. Render will detect `render.yaml` automatically. Confirm these settings:
   - **Root directory**: `server`
   - **Build command**: `npm install`
   - **Start command**: `npm start`
5. Click **"Create Web Service"**.
6. Wait ~2 minutes. Render gives you a URL like:
   ```
   https://sastrachat-server.onrender.com
   ```
   **Copy this URL** — you need it in the next step.

---

### Step 2 — Deploy the Frontend on Vercel (free)

1. Go to **[vercel.com](https://vercel.com)** and sign up / log in with GitHub.
2. Click **"Add New Project"** → import **`havishkarthik/sastrarandomchat`**.
3. Set the **Root Directory** to **`client`**.
4. Under **Environment Variables**, add:
   | Name | Value |
   |------|-------|
   | `VITE_SERVER_URL` | `https://sastrachat-server.onrender.com` ← paste your Render URL from Step 1 |
5. Click **"Deploy"**.
6. Vercel gives you a URL like:
   ```
   https://sastrarandomchat.vercel.app
   ```
   🎉 **This is your shareable link!** Send it to your friends.

---

### Step 3 — Allow your frontend on the backend (CORS)

1. Go back to your Render dashboard → your web service → **Environment**.
2. Set the `CLIENT_ORIGIN` variable to your Vercel URL, e.g.:
   ```
   CLIENT_ORIGIN=https://sastrarandomchat.vercel.app
   ```
3. Render will restart the server automatically.

---

That's it! Your friends can now open **`https://sastrarandomchat.vercel.app`** (or whatever URL Vercel assigned) and start chatting anonymously. 🎉

---

## Features

- 🎲 **Random 1-on-1 matching** — instantly paired with another Sastra student
- 📍 **Location-based pairing** — prioritises students near you on campus (GPS)
- ⚡ **Real-time messaging** via Socket.io WebSockets
- ✍️ **Typing indicators** — see when your partner is composing a message
- ⏭ **Next** button — skip to a new partner instantly
- 🔒 **Fully anonymous** — no sign-up, no profiles, no message history
- 🚩 **Report** button for inappropriate behaviour
- 📵 **Auto-disconnect** after 10 minutes of inactivity
- 📱 Mobile-first responsive UI

## Project Structure

```
sastrarandomchat/
├── client/                     # React + Vite frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatBox.jsx     # Message list with typing indicator
│   │   │   ├── MessageInput.jsx
│   │   │   └── StartScreen.jsx
│   │   ├── services/
│   │   │   ├── socket.js       # Socket.io client
│   │   │   └── location.js     # Geolocation helpers
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── server/                     # Node.js + Express + Socket.io backend
│   ├── src/
│   │   ├── matching/
│   │   │   ├── matchingAlgorithm.js   # Queue & pairing logic
│   │   │   └── locationService.js     # Haversine + campus zones
│   │   ├── socket/
│   │   │   └── socketHandler.js       # All Socket.io event handlers
│   │   └── server.js
│   └── package.json
├── package.json                # Root convenience scripts
├── .gitignore
└── README.md
```

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- npm v9 or later

## Getting Started (Local Development)

### 1. Install dependencies

```bash
# Install all (server + client)
npm run install:all

# Or install individually
npm install --prefix server
npm install --prefix client
```

### 2. Start the backend server

```bash
npm run dev:server
# Server starts on http://localhost:3001
```

### 3. Start the frontend (separate terminal)

```bash
npm run dev:client
# App opens at http://localhost:5173
```

### Environment Variables

#### Server (`server/.env`)

| Variable        | Default                  | Description                          |
|-----------------|--------------------------|--------------------------------------|
| `PORT`          | `3001`                   | HTTP / WebSocket port                |
| `CLIENT_ORIGIN` | `http://localhost:5173`  | Allowed CORS origin for the client   |

#### Client (`client/.env`)

| Variable          | Default                  | Description                |
|-------------------|--------------------------|----------------------------|
| `VITE_SERVER_URL` | `http://localhost:3001`  | Backend server URL         |

## Deployment

### Build the client

```bash
npm run build:client
# Output in client/dist/
```

Serve `client/dist/` from any static host (Vercel, Netlify, Cloudflare Pages, etc.).  
Set `VITE_SERVER_URL` to your production server URL before building.

### Start production server

```bash
NODE_ENV=production CLIENT_ORIGIN=https://your-client-domain.com npm run start:server
```

## Socket.io Events Reference

| Event                 | Direction          | Payload                           | Description                              |
|-----------------------|--------------------|-----------------------------------|------------------------------------------|
| `session_created`     | Server → Client    | `{ sessionId }`                   | Assigned anonymous session ID            |
| `location_update`     | Client → Server    | `{ lat, lng }`                    | Send GPS coordinates                     |
| `find_match`          | Client → Server    | —                                 | Request random partner                   |
| `waiting`             | Server → Client    | `{ position }`                    | In queue at given position               |
| `matched`             | Server → Client    | `{ zone, partnerZone }`           | Successfully paired with a stranger      |
| `message`             | Bidirectional      | `{ text, from? }`                 | Chat message                             |
| `message_delivered`   | Server → Client    | —                                 | Delivery acknowledgement                 |
| `typing`              | Bidirectional      | `{ isTyping }`                    | Typing indicator                         |
| `next`                | Client → Server    | —                                 | Skip to new partner                      |
| `stop`                | Client → Server    | —                                 | End current chat                         |
| `chat_stopped`        | Server → Client    | —                                 | Confirmation chat was stopped            |
| `partner_disconnected`| Server → Client    | `{ reason }`                      | Partner left or skipped                  |
| `report`              | Client → Server    | `{ reason }`                      | Report current partner                   |
| `report_received`     | Server → Client    | —                                 | Acknowledgement of report                |
| `auto_disconnect`     | Server → Client    | `{ reason }`                      | Kicked for inactivity                    |

## Campus Location Details

- **Center**: 10.7626° N, 79.0193° E
- **Campus radius**: ~2 km
- **Zones detected**: Main Block, Library, Boys Hostel, Girls Hostel, Labs, Cafeteria, Sports Complex
- **Matching priority**: within 500 m → within 2 km → anyone in queue

## Privacy & Safety

- No user accounts or profiles
- Messages are **never stored** — they exist only in memory for active sessions
- Auto-disconnect after **10 minutes** of inactivity
- Anonymous session IDs are regenerated each connection
- Report system alerts moderators without exposing user identity

## License

This project is released into the public domain under [The Unlicense](LICENSE).
You are free to copy, modify, publish, use, compile, sell, or distribute this
software for any purpose, without any conditions or restrictions.
