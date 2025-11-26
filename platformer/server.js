const express = require('express');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname, 'public')));

// World + physics
const TICK_RATE = 60;
const GRAVITY = 1600;

const WORLD = {
  width: 5000,
  height: 2000,
  platforms: [
    {"x":286.08,"y":1205.79,"w":405.63,"h":42.53,"rotation":0,"material":"normal"},
    {"x":681.58,"y":1205.79,"w":405.63,"h":42.53,"rotation":0,"material":"normal"},
    {"x":1068.97,"y":1205.79,"w":405.63,"h":42.53,"rotation":0,"material":"normal"},
    {"x":1434.04,"y":1205.79,"w":405.63,"h":42.53,"rotation":0,"material":"normal"},
    {"x":1719.68,"y":1204.66,"w":405.63,"h":42.53,"rotation":0,"material":"normal"},
    {"x":316.50,"y":1163.25,"w":405.63,"h":42.53,"rotation":0,"material":"bounce"},
    {"x":685.64,"y":1080.30,"w":405.63,"h":42.53,"rotation":-25.84,"material":"lava"},
    {"x":1052.74,"y":948.44,"w":405.63,"h":42.53,"rotation":0,"material":"ice"},
    {"x":1557.76,"y":648.55,"w":405.63,"h":42.53,"rotation":-55.89,"material":"normal"},
    {"x":1726.10,"y":1165.38,"w":405.63,"h":42.53,"rotation":0,"material":"sticky"},
    {"x":1322.49,"y":1163.25,"w":405.63,"h":42.53,"rotation":0,"material":"sticky"},
    {"x":1744.36,"y":1063.29,"w":405.63,"h":42.53,"rotation":-20.00,"material":"bounce"},
    {"x":1210.94,"y":389.06,"w":405.63,"h":42.53,"rotation":0,"material":"bounce"},
    {"x":841.81,"y":633.66,"w":405.63,"h":42.53,"rotation":0,"material":"lava"},
    {"x":683.61,"y":495.41,"w":405.63,"h":42.53,"rotation":-145.36,"material":"ice"},
    {"x":782.99,"y":194.43,"w":405.63,"h":42.53,"rotation":0,"material":"sticky"},
    {"x":195.75,"y":210.23,"w":405.63,"h":42.53,"rotation":61.93,"material":"normal"},
    {"x":1535.45,"y":170,"w":405.63,"h":42.53,"rotation":0,"material":"ice"},
    {"x":478.76,"y":725.11,"w":405.63,"h":42.53,"rotation":-24.41,"material":"bounce"},
    {"x":136,"y":533.69,"w":405.63,"h":42.53,"rotation":0,"material":"normal"}
  ]
};

let players = {};
let chatHistory = [];

// Serve client
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Sockets
io.on('connection', (socket) => {
  const username = "Player" + Math.floor(Math.random() * 10000);
  players[username] = spawnPlayer(username);

  socket.emit('auth', { username });
  socket.emit('world', { world: WORLD, players });
  socket.emit('chat history', chatHistory);
  io.emit('player join', { username, state: players[username] });

  socket.on('input', (input) => {
    if (players[username]) {
      players[username].input = input;
    }
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

// Physics loop
let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = (now - last) / 1000;
  last = now;

  for (const p of Object.values(players)) stepPlayer(p, dt);
  io.emit('state', players);
}, 1000 / TICK_RATE);

// Spawn function
function spawnPlayer(username) {
  return {
    x: 80 + Math.random() * 100,
    y: 500,
    vx: 0,
    vy: 0,
    dir: 1,
    onGround: false,
    color: colorFromName(username),
    input: { left: false, right: false, up: false },
    coyoteTimer: 0,
    jumpBuffer: 0
  };
}

// Physics with coyote time, buffering, materials
function stepPlayer(p, dt) {
  const input = p.input && typeof p.input === 'object' ? p.input : { left: false, right: false, up: false };
  p.input = input;

  const ACCEL = 1500;
  const FRICTION = 1200;
  const MAX_SPEED = 300;
  const JUMP_VELOCITY = -600;
  const COYOTE_TIME = 0.1;
  const JUMP_BUFFER = 0.15;
  const w = 40, h = 60;

  if (p.onGround) p.coyoteTimer = COYOTE_TIME;
  else p.coyoteTimer = Math.max(0, p.coyoteTimer - dt);

  p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
  if (input.up) p.jumpBuffer = JUMP_BUFFER;

  if (input.left) { p.vx -= ACCEL * dt; p.dir = -1; }
  if (input.right) { p.vx += ACCEL * dt; p.dir = 1; }

  if (!input.left && !input.right) {
    if (p.vx > 0) p.vx = Math.max(0, p.vx - FRICTION * dt);
    else if (p.vx < 0) p.vx = Math.min(0, p.vx + FRICTION * dt);
  }

  p.vx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, p.vx));

  if (p.jumpBuffer > 0 && p.coyoteTimer > 0) {
    p.vy = JUMP_VELOCITY;
    p.onGround = false;
    p.coyoteTimer = 0;
    p.jumpBuffer = 0;
  }

  p.vy += GRAVITY * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;

  // Bounds
  if (p.x < 0) { p.x = 0; p.vx = Math.max(0, p.vx); }
  if (p.x + w > WORLD.width) { p.x = WORLD.width - w; p.vx = Math.min(0, p.vx); }
  if (p.y + h > WORLD.height) {
    p.y = WORLD.height - h;
    p.vy = 0;
    p.onGround = true;
  } else if (p.y < 0) {
    p.y = 0;
    p.vy = Math.max(0, p.vy);
  } else {
    p.onGround = false;
  }

  // Collisions
  resolveCollisionsWithPlatforms(p, w, h, WORLD.platforms, COYOTE_TIME);
}

// Approximate rotated rect as axis-aligned bounding box
function aabbOfRotRect(plat) {
  const cx = plat.x + plat.w/2;
  const cy = plat.y + plat.h/2;
  const ang = (plat.rotation || 0) * Math.PI/180;
  const cos = Math.cos(ang), sin = Math.sin(ang);
  const hw = plat.w/2, hh = plat.h/2;

  const corners = [
    {x: -hw, y: -hh}, {x: hw, y: -hh},
    {x: hw, y: hh},   {x: -hw, y: hh}
    ].map(pt => ({
    x: cx + pt.x * cos - pt.y * sin,
    y: cy + pt.x * sin + pt.y * cos
  }));

  const xs = corners.map(c => c.x), ys = corners.map(c => c.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);

  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// AABB resolve (player axis-aligned)
function aabbResolve(p, pw, ph, plat) {
  const ax1 = p.x, ay1 = p.y, ax2 = p.x + pw, ay2 = p.y + ph;
  const bx1 = plat.x, by1 = plat.y, bx2 = plat.x + plat.w, by2 = plat.y + plat.h;

  if (ax2 <= bx1 || ax1 >= bx2 || ay2 <= by1 || ay1 >= by2) return null;

  const overlapX = Math.min(ax2 - bx1, bx2 - ax1);
  const overlapY = Math.min(ay2 - by1, by2 - ay1);

  const aCenterX = (ax1 + ax2) / 2;
  const aCenterY = (ay1 + ay2) / 2;
  const bCenterX = (bx1 + bx2) / 2;
  const bCenterY = (by1 + by2) / 2;

  if (overlapX < overlapY) {
    if (aCenterX < bCenterX) p.x -= overlapX;
    else p.x += overlapX;
    return 'side';
  } else {
    if (aCenterY < bCenterY) {
      p.y -= overlapY;
      return 'top';
    } else {
      p.y += overlapY;
      return 'bottom';
    }
  }
}

function resolveCollisionsWithPlatforms(p, w, h, platforms, COYOTE_TIME) {
  if (!Array.isArray(platforms)) return;
  let groundedThisTick = false;

  for (let iter = 0; iter < 3; iter++) {
    let any = false;
    for (const plat of platforms) {
      const aabb = aabbOfRotRect(plat);
      const collision = aabbResolve(p, w, h, aabb);
      if (!collision) continue;
      any = true;

      if (collision === 'top') {
        p.vy = Math.min(p.vy, 0);
        p.onGround = true;
        groundedThisTick = true;
        p.coyoteTimer = COYOTE_TIME;
        switch (plat.material) {
          case "ice":    p.vx *= 1.05; break;
          case "lava":   respawnPlayer(p); break;
          case "bounce": p.vy = -800; break;
          case "sticky": p.vx *= 0.5; break;
        }
      } else if (collision === 'bottom') {
        p.vy = Math.max(p.vy, 0);
      } else {
        p.vx = 0;
      }
    }
    if (!any) break;
  }

  if (!groundedThisTick && p.y + h < WORLD.height) {
    p.onGround = false;
  }
}

function respawnPlayer(p) {
  const spawned = spawnPlayer('temp');
  p.x = spawned.x;
  p.y = spawned.y;
  p.vx = 0;
  p.vy = 0;
  p.onGround = false;
  p.coyoteTimer = 0;
  p.jumpBuffer = 0;
  p.dir = 1;
}

function colorFromName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  const r = 150 + (hash & 0x3F);
  const g = 150 + ((hash >> 6) & 0x3F);
  const b = 150 + ((hash >> 12) & 0x3F);
  return `rgb(${r},${g},${b})`;
}

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
