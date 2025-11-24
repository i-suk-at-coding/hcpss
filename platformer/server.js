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
  height: 1000,
  platforms: [   {     "x": -17,     "y": 557,     "w": 200,     "h": 20,     "rotation": 0,     "material": "normal",     "rotationHandle": {       "x": 83,       "y": 517     }   },   {     "x": 178,     "y": 557,     "w": 200,     "h": 20,     "rotation": 0,     "material": "normal",     "rotationHandle": {       "x": 278,       "y": 517     }   },   {     "x": 369,     "y": 557,     "w": 200,     "h": 20,     "rotation": 0,     "material": "normal",     "rotationHandle": {       "x": 469,       "y": 517     }   },   {     "x": 550,     "y": 558,     "w": 200,     "h": 20,     "rotation": 0,     "material": "normal",     "rotationHandle": {       "x": 650,       "y": 518     }   },   {     "x": 731,     "y": 558,     "w": 200,     "h": 20,     "rotation": 0,     "material": "normal",     "rotationHandle": {       "x": 831,       "y": 518     }   },   {     "x": -2,     "y": 537,     "w": 200,     "h": 20,     "rotation": 0,     "material": "bounce",     "rotationHandle": {       "x": 98,       "y": 497     }   },   {     "x": 180,     "y": 498,     "w": 200,     "h": 20,     "rotation": -25.848396921234784,     "material": "lava",     "rotationHandle": {       "x": 280,       "y": 458     }   },   {     "x": 361,     "y": 436,     "w": 200,     "h": 20,     "rotation": 0,     "material": "ice",     "rotationHandle": {       "x": 461,       "y": 396     }   },   {     "x": 610,     "y": 293,     "w": 200,     "h": 20,     "rotation": -55.89327400874002,     "material": "normal",     "rotationHandle": {       "x": 710,       "y": 253     }   },   {     "x": 693,     "y": 538,     "w": 200,     "h": 20,     "rotation": 0,     "material": "sticky",     "rotationHandle": {       "x": 793,       "y": 498     }   },   {     "x": 494,     "y": 537,     "w": 200,     "h": 20,     "rotation": 0,     "material": "sticky",     "rotationHandle": {       "x": 594,       "y": 497     }   },   {     "x": 702,     "y": 490,     "w": 200,     "h": 20,     "rotation": -20.004195272804814,     "material": "bounce",     "rotationHandle": {       "x": 802,       "y": 450     }   },   {     "x": 439,     "y": 173,     "w": 200,     "h": 20,     "rotation": 0,     "material": "bounce",     "rotationHandle": {       "x": 539,       "y": 133     }   },   {     "x": 257,     "y": 288,     "w": 200,     "h": 20,     "rotation": 0,     "material": "lava",     "rotationHandle": {       "x": 357,       "y": 248     }   },   {     "x": 179,     "y": 223,     "w": 200,     "h": 20,     "rotation": -145.36663147729428,     "material": "ice",     "rotationHandle": {       "x": 279,       "y": 183     }   },   {     "x": 78,     "y": 334,     "w": 200,     "h": 20,     "rotation": -24.393184955454057,     "material": "ice",     "rotationHandle": {       "x": 178,       "y": 294     }   },   {     "x": 228,     "y": 82,     "w": 200,     "h": 20,     "rotation": 0,     "material": "sticky",     "rotationHandle": {       "x": 328,       "y": 42     }   },   {     "x": -68,     "y": 76,     "w": 200,     "h": 20,     "rotation": 61.936741224062125,     "material": "normal",     "rotationHandle": {       "x": 32,       "y": 36     }   },   {     "x": 599,     "y": 70,     "w": 200,     "h": 20,     "rotation": 0,     "material": "ice",     "rotationHandle": {       "x": 699,       "y": 30     }   },   {     "x": 78,     "y": 331,     "w": 200,     "h": 20,     "rotation": -24.412688363272864,     "material": "bounce",     "rotationHandle": {       "x": 178,       "y": 291     }   },   {     "x": -91,     "y": 241,     "w": 200,     "h": 20,     "rotation": 0,     "material": "normal",     "rotationHandle": {       "x": 9,       "y": 201     }   } ]
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
    const p = players[username];
    if (p) p.input = input;
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
  if (p.input.up) p.jumpBuffer = JUMP_BUFFER;

  if (p.input.left) { p.vx -= ACCEL * dt; p.dir = -1; }
  if (p.input.right) { p.vx += ACCEL * dt; p.dir = 1; }

  if (!p.input.left && !p.input.right) {
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
  if (p.x < 0) p.x = 0;
  if (p.x + w > WORLD.width) p.x = WORLD.width - w;
  if (p.y + h > WORLD.height) {
    p.y = WORLD.height - h;
    p.vy = 0;
    p.onGround = true;
  } else {
    p.onGround = false;
  }

  // Collisions (approximate rotated platforms by their AABB)
  for (const plat of WORLD.platforms) {
    const aabb = aabbOfRotRect(plat);
    const collision = aabbResolve(p, w, h, aabb);
    if (!collision) continue;

    if (collision === 'top') {
      p.vy = 0;
      p.onGround = true;
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
      // side hit
      p.vx = 0;
    }
  }
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

  if (ax2 < bx1 || ax1 > bx2 || ay2 < by1 || ay1 > by2) return null;

  const overlapX = Math.min(ax2 - bx1, bx2 - ax1);
  const overlapY = Math.min(ay2 - by1, by2 - ay1);

  if (overlapX < overlapY) {
    if (p.vx > 0) p.x -= overlapX;
    else p.x += overlapX;
    return 'side';
  } else {
    if (p.vy > 0) {
      p.y -= overlapY;
      return 'top';
    } else {
      p.y += overlapY;
      return 'bottom';
    }
  }
}

function respawnPlayer(p) {
  p.x = 80;
  p.y = 500;
  p.vx = 0;
  p.vy = 0;
  p.onGround = false;
  p.coyoteTimer = 0;
  p.jumpBuffer = 0;
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
