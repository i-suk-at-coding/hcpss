// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// --- Game state ---
const PLAYER_SIZE = { w: 40, h: 60 };
const GRAVITY = 0.8;
const JUMP_STRENGTH = -15;
const MOVE_SPEED = 5;

let world = {
  width: 2000,
  height: 1200,
  platforms: [
    { x: 100, y: 500, w: 200, h: 20, rotation: 0, material: 'normal' },
    { x: 400, y: 400, w: 200, h: 20, rotation: 15, material: 'ice' },
    { x: 700, y: 300, w: 200, h: 20, rotation: -20, material: 'lava' }
  ]
};
let players = {};
let chatHistory = [];

// --- Collision helpers (SAT) ---
function getAABBCorners(x, y, w, h) {
  return [
    { x, y }, { x: x + w, y },
    { x: x + w, y: y + h }, { x, y: y + h }
  ];
}
function getOBBCorners(x, y, w, h, rotationDeg) {
  const cx = x + w/2, cy = y + h/2;
  const ang = rotationDeg * Math.PI/180;
  const cos = Math.cos(ang), sin = Math.sin(ang);
  const halfW = w/2, halfH = h/2;
  const local = [
    { x:-halfW, y:-halfH }, { x: halfW, y:-halfH },
    { x: halfW, y: halfH }, { x:-halfW, y: halfH }
  ];
  return local.map(p => ({
    x: cx + p.x*cos - p.y*sin,
    y: cy + p.x*sin + p.y*cos
  }));
}
function dot(a,b){ return a.x*b.x + a.y*b.y; }
function project(points, axis){
  let min=Infinity,max=-Infinity;
  for(const p of points){
    const d=dot(p,axis);
    if(d<min)min=d;
    if(d>max)max=d;
  }
  return {min,max};
}
function overlap(polyA, polyB, axis){
  const pa=project(polyA,axis), pb=project(polyB,axis);
  return !(pa.max < pb.min || pb.max < pa.min);
}
function obbAabbCollide(player, plat){
  const aabb = getAABBCorners(player.x, player.y, player.w, player.h);
  const obb = getOBBCorners(plat.x, plat.y, plat.w, plat.h, plat.rotation||0);
  const ang = (plat.rotation||0)*Math.PI/180;
  const ux = {x:Math.cos(ang), y:Math.sin(ang)};
  const uy = {x:-Math.sin(ang), y:Math.cos(ang)};
  const axes = [{x:1,y:0},{x:0,y:1}, ux, uy];

  let minOverlap = Infinity;
  let smallestAxis = null;

  for(const axis of axes){
    if(!overlap(aabb,obb,axis)) return null; // separating axis
    const pa=project(aabb,axis), pb=project(obb,axis);
    const overlapAmt = Math.min(pa.max,pb.max) - Math.max(pa.min,pb.min);
    if(overlapAmt < minOverlap){
      minOverlap = overlapAmt;
      smallestAxis = axis;
    }
  }
  return { axis: smallestAxis, depth: minOverlap };
}

// --- Socket.io ---
io.on('connection', socket => {
  const username = `Player${Math.floor(Math.random()*1000)}`;
  players[username] = {
    x: 100, y: 100, vx: 0, vy: 0,
    dir: 1, color: randomColor(),
    w: PLAYER_SIZE.w, h: PLAYER_SIZE.h,
    onGround: false, input: {}
  };

  socket.emit('auth', { username });
  socket.emit('world', { world, players });
  socket.emit('chat history', chatHistory);
  socket.broadcast.emit('player join', { username, state: players[username] });

  socket.on('disconnect', () => {
    delete players[username];
    socket.broadcast.emit('player leave', { username });
  });

  socket.on('input', input => {
    const p = players[username];
    if (!p) return;
    p.input = input; // store input state for physics loop
  });

  socket.on('chat message', text => {
    const msg = { user: username, text, time: Date.now() };
    chatHistory.push(msg);
    if (chatHistory.length > 50) chatHistory.shift();
    io.emit('chat message', msg);
  });
});

// --- Physics loop ---
setInterval(() => {
  for (const [username, p] of Object.entries(players)) {
    // Gravity
    p.vy += GRAVITY;

    // Horizontal input
    if (p.input?.left) { p.vx = -MOVE_SPEED; p.dir = -1; }
    else if (p.input?.right) { p.vx = MOVE_SPEED; p.dir = 1; }
    else { p.vx = 0; }

    // Jump
    if (p.input?.up && p.onGround) {
      p.vy = JUMP_STRENGTH;
      p.onGround = false;
    }

    // Proposed new position
    p.x += p.vx;
    p.y += p.vy;

    // Collision resolution
    p.onGround = false;
    for (const plat of world.platforms) {
      const result = obbAabbCollide(p, plat);
      if (result) {
        // Push player out along smallest axis
        p.x += result.axis.x * result.depth;
        p.y += result.axis.y * result.depth;

        // If resolving along Y axis and moving downward, treat as ground
        if (result.axis.y < 0 && p.vy > 0) {
          p.vy = 0;
          p.onGround = true;
        }
      }
    }

    // World bounds
    if (p.y > world.height - p.h) {
      p.y = world.height - p.h;
      p.vy = 0;
      p.onGround = true;
    }
    if (p.x < 0) p.x = 0;
    if (p.x > world.width - p.w) p.x = world.width - p.w;
  }

  io.emit('state', players);
}, 1000/60);

// --- Helpers ---
function randomColor() {
  const colors = ['#3b82f6','#ef4444','#facc15','#10b981','#a3e635'];
  return colors[Math.floor(Math.random()*colors.length)];
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
