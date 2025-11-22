const express = require('express');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname, 'public')));

// Game constants
const TICK_RATE = 60;
const GRAVITY = 1600;
const MOVE_SPEED = 300;
const JUMP_VELOCITY = -600;
const WORLD = {
  width: 1200,
  height: 700,
  platforms: [
    { x: 0, y: 660, w: 1200, h: 40 },
    { x: 150, y: 520, w: 250, h: 20 },
    { x: 480, y: 450, w: 240, h: 20 },
    { x: 800, y: 380, w: 280, h: 20 },
    { x: 300, y: 300, w: 180, h: 20 }
  ]
};

let players = {};
let chatHistory = [];

// Serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.IO
io.on('connection', (socket) => {
  const username = "Player" + Math.floor(Math.random() * 10000);
  players[username] = spawnPlayer(username);

  socket.emit('auth', { username });
  socket.emit('world', { world: WORLD, players });
  socket.emit('chat history', chatHistory);

  io.emit('player join', { username, state: players[username] });

  socket.on('input', (input) => {
    if (players[username]) players[username].input = input;
  });

  socket.on('chat message', (text) => {
    const msg = { user: username, text, time: new Date().toISOString() };
    chatHistory.push(msg);
    if (chatHistory.length > 200) chatHistory.shift();
    io.emit('chat message', msg);
  });

  socket.on('disconnect', () => {
    delete players[username];
    io.emit('player leave', { username });
  });
});

// Game loop
let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = (now - last) / 1000;
  last = now;

  for (const p of Object.values(players)) stepPlayer(p, dt);

  io.emit('state', players);
}, 1000 / TICK_RATE);

function spawnPlayer(username) {
  return {
    x: 80 + Math.random() * 100,
    y: 500,
    vx: 0,
    vy: 0,
    dir: 1,
    onGround: false,
    color: colorFromName(username),
    input: { left: false, right: false, up: false }
  };
}

function stepPlayer(p, dt) {
  p.vx = 0;
  if (p.input.left) { p.vx = -MOVE_SPEED; p.dir = -1; }
  if (p.input.right) { p.vx = MOVE_SPEED; p.dir = 1; }
  if (p.input.up && p.onGround) { p.vy = JUMP_VELOCITY; p.onGround = false; }
  p.vy += GRAVITY * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;

  const w = 40, h = 60;
  if (p.x < 0) p.x = 0;
  if (p.x + w > WORLD.width) p.x = WORLD.width - w;
  if (p.y + h > WORLD.height) { p.y = WORLD.height - h; p.vy = 0; p.onGround = true; }

  p.onGround = false;
  for (const plat of WORLD.platforms) {
    const collision = aabbResolve(p, w, h, plat);
    if (collision === 'top') { p.vy = 0; p.onGround = true; }
  }
}

function aabbResolve(p, pw, ph, plat) {
  const ax1 = p.x, ay1 = p.y, ax2 = p.x + pw, ay2 = p.y + ph;
  const bx1 = plat.x, by1 = plat.y, bx2 = plat.x + plat.w, by2 = plat.y + plat.h;
  if (ax2 < bx1 || ax1 > bx2 || ay2 < by1 || ay1 > by2) return null;
  const overlapX = Math.min(ax2 - bx1, bx2 - ax1);
  const overlapY = Math.min(ay2 - by1, by2 - ay1);
  if (overlapX < overlapY) { if (p.vx > 0) p.x -= overlapX; else p.x += overlapX; return 'side'; }
  else { if (p.vy > 0) { p.y -= overlapY; return 'top'; } else { p.y += overlapY; return 'bottom'; } }
}

function colorFromName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const r = 150 + (hash & 0x3F), g = 150 + ((hash >> 6) & 0x3F), b = 150 + ((hash >> 12) & 0x3F);
  return `rgb(${r},${g},${b})`;
}

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
