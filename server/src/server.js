const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { registerSocketHandlers } = require("./socket/socketHandler");
const routes = require("./routes");
const { createHttpRateLimiter } = require("./utils/rateLimiter");

const PORT = process.env.PORT || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

// HTTP-level rate limiter: 100 requests per minute per IP
app.use(createHttpRateLimiter({ maxRequests: 100, windowMs: 60_000 }));

// Mount REST routes (includes /health and /stats)
app.use("/", routes);

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ["GET", "POST"],
  },
});

registerSocketHandlers(io);

httpServer.listen(PORT, () => {
  console.log(`Sastra Random Chat server running on port ${PORT}`);
});
