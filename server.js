// server.js
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app        = express();
const httpServer = createServer(app);
const io         = new SocketIOServer(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// ---------- Static build ----------
const distPath = path.join(__dirname, "dist");
app.use(express.static(distPath));

// ---------- Service-worker ----------
app.get("/service-worker.js", (req, res) => {
  res.setHeader("Content-Type", "application/javascript");
  // make it explicit that the worker can own the whole origin
  res.setHeader("Service-Worker-Allowed", "/");
  res.sendFile(path.join(distPath, "service-worker.js"));
});

// ---------- Main + client pages ----------
app.get("/session/:sessionId",          (_, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});
app.get("/session/:sessionId/client",   (_, res) => {
  res.sendFile(path.join(distPath, "client.html"));
});

// ---------- Socket.IO ----------
io.on("connection", socket => {
  const { sessionId } = socket.handshake.query;
  if (sessionId) socket.join(sessionId);

  socket.on("keyPress", data => io.to(sessionId).emit("keyPress", data));
});

// ---------- Start ----------
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () =>
  console.log(`Server listening on http://localhost:${PORT}`)
);
