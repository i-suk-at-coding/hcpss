const express = require('express');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname, 'public')));

const TICK_RATE = 60;
const GRAVITY = 1600;

// --- SAT helpers ---
function dot(a,b){return a.x*b.x+a.y*b.y;}
function sub(a,b){return {x:a.x-b.x,y:a.y-b.y};}
function normalize(v){const l=Math.hypot(v.x,v.y);return l?{x:v.x/l,y:v.y/l}:{x:0,y:0};}
function getAABBCorners(x,y,w,h){return [{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];}
function project(corners,axis){
  let min=Infinity,max=-Infinity;
  for(const c of corners){
    const s=dot(c,axis);
    if(s<min)min=s;
    if(s>max)max=s;
  }
  return {min,max};
}
function overlapAmount(a,b){return Math.min(a.max,b.max)-Math.max(a.min,b.min);}

// Get corners for rotated rect
function getRotRectCorners(p){
  const cx=p.x+p.w/2, cy=p.y+p.h/2, rad=(p.rotation||0)*Math.PI/180;
  const local=[{x:-p.w/2,y:-p.h/2},{x:p.w/2,y:-p.h/2},{x:p.w/2,y:p.h/2},{x:-p.w/2,y:p.h/2}];
  return local.map(v=>({
    x:cx+v.x*Math.cos(rad)-v.y*Math.sin(rad),
    y:cy+v.x*Math.sin(rad)+v.y*Math.cos(rad)
  }));
}

// Generalized SAT: player AABB vs any convex polygon
function satAabbVsPolygon(player, polygonPoints, w, h) {
  const a = getAABBCorners(player.x, player.y, w, h);

  // axes: AABB + polygon edges
  const axes = [{x:1,y:0},{x:0,y:1}];
  for (let i=0; i<polygonPoints.length; i++) {
    const p1 = polygonPoints[i];
    const p2 = polygonPoints[(i+1)%polygonPoints.length];
    const edge = sub(p2,p1);
    const axis = normalize({x:-edge.y,y:edge.x});
    axes.push(axis);
  }

  let minOverlap = Infinity;
  let smallestAxis = null;

  for (const axis of axes) {
    const pa = project(a, axis);
    const pb = project(polygonPoints, axis);
    const overlap = overlapAmount(pa,pb);
    if (overlap <= 0) return null;
    if (overlap < minOverlap) {
      minOverlap = overlap;
      smallestAxis = axis;
    }
  }

  // direction correction
  const polyCenter = polygonPoints.reduce((acc,p)=>({x:acc.x+p.x,y:acc.y+p.y}),{x:0,y:0});
  polyCenter.x /= polygonPoints.length;
  polyCenter.y /= polygonPoints.length;
  const centerDelta = {x:(player.x+w/2)-polyCenter.x, y:(player.y+h/2)-polyCenter.y};
  if (dot(centerDelta, smallestAxis) < 0) {
    smallestAxis = {x:-smallestAxis.x, y:-smallestAxis.y};
  }

  return {axis: smallestAxis, depth: minOverlap};
}

// --- Curve helpers ---
// Approximate a circle into polygon points
function circleToPolygon(cx, cy, radius, segments=24) {
  const pts = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * 2 * Math.PI;
    pts.push({
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle)
    });
  }
  return pts;
}

// Approximate a quadratic Bezier curve into polygon points
function bezierToPolygon(p0, p1, p2, steps=20) {
  const pts = [];
  for (let t = 0; t <= 1; t += 1/steps) {
    const x = (1-t)*(1-t)*p0.x + 2*(1-t)*t*p1.x + t*t*p2.x;
    const y = (1-t)*(1-t)*p0.y + 2*(1-t)*t*p1.y + t*t*p2.y;
    pts.push({x,y});
  }
  return pts;
}

// --- World ---
const WORLD = {
  width: 5000,
  height: 2000,
  platforms: [
    {
  "platforms": [
    {
      "type": "curve",
      "material": "ice",
      "points": [
        {
          "x": 714,
          "y": 372
        },
        {
          "x": 620.16,
          "y": 354.42999999999995
        },
        {
          "x": 463.44000000000005,
          "y": 317.12
        },
        {
          "x": 349.84000000000003,
          "y": 286.06999999999994
        },
        {
          "x": 247.36000000000007,
          "y": 248.2800000000001
        },
        {
          "x": 160,
          "y": 215.75
        },
        {
          "x": 60.75999999999999,
          "y": 135.47999999999996
        },
        {
          "x": 159.64,
          "y": 252.46999999999997
        },
        {
          "x": 439.64,
          "y": 330.72
        },
        {
          "x": 496.76,
          "y": 346.23
        },
        {
          "x": 555.9999999999999,
          "y": 360.99999999999994
        },
        {
          "x": 617.3599999999999,
          "y": 375.03
        },
        {
          "x": 680.8399999999999,
          "y": 388.32
        },
        {
          "x": 746.44,
          "y": 400.87
        },
        {
          "x": 814.1600000000001,
          "y": 412.68
        },
        {
          "x": 884.0000000000002,
          "y": 423.75000000000006
        },
        {
          "x": 955.9600000000002,
          "y": 434.08000000000004
        },
        {
          "x": 1029.0400000000004,
          "y": 437.6700000000001
        },
        {
          "x": 1104.2400000000005,
          "y": 435.52
        },
        {
          "x": 780.5600000000004,
          "y": 384.63
        }
      ]
    }
  ],
  "spawn": {
    "x": 100,
    "y": 100
  }
};

let players = {};
let chatHistory = [];

// Serve client
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket connections
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

// Physics loop
let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = (now - last) / 1000;
  last = now;

  for (const p of Object.values(players)) stepPlayer(p, dt);
  io.emit('state', players);
}, 1000 / TICK_RATE);

// Spawn
function spawnPlayer(username) {
  const spawn = WORLD.spawn || { x: 100, y: 500 };
  return {
    x: spawn.x,
    y: spawn.y,
    vx: 0, vy: 0,
    dir: 1,
    onGround: false,
    color: colorFromName(username),
    input: { left: false, right: false, up: false },
    coyoteTimer: 0,
    jumpBuffer: 0
  };
}

function respawnPlayer(p) {
  const spawn = WORLD.spawn || { x: 100, y: 500 };
  p.x = spawn.x;
  p.y = spawn.y;
  p.vx = 0;
  p.vy = 0;
  p.onGround = false;
  p.coyoteTimer = 0;
  p.jumpBuffer = 0;
  p.dir = 1;
}

// Physics step
function stepPlayer(p, dt) {
  const ACCEL=1500, FRICTION=1200, MAX_SPEED=300, JUMP_VELOCITY=-600, COYOTE_TIME=0.1, JUMP_BUFFER=0.15;
  const w=40,h=60;

  if (p.onGround) p.coyoteTimer = COYOTE_TIME;
  else p.coyoteTimer = Math.max(0, p.coyoteTimer - dt);

  p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
  if (p.input.up) p.jumpBuffer = JUMP_BUFFER;

  if (p.input.left) { p.vx -= ACCEL*dt; p.dir=-1; }
  if (p.input.right){ p.vx += ACCEL*dt; p.dir=1; }
  if (!p.input.left && !p.input.right){
    if (p.vx>0) p.vx=Math.max(0,p.vx-FRICTION*dt);
    else if (p.vx<0) p.vx=Math.min(0,p.vx+FRICTION*dt);
  }
  p.vx=Math.max(-MAX_SPEED,Math.min(MAX_SPEED,p.vx));

  if (p.jumpBuffer>0 && p.coyoteTimer>0){
    p.vy=JUMP_VELOCITY;
    p.onGround=false;
    p.coyoteTimer=0;
    p.jumpBuffer=0;
  }

  p.vy+=GRAVITY*dt;
  p.x+=p.vx*dt;
  p.y+=p.vy*dt;

  // Collisions with SAT
  let grounded=false;
  for(const plat of WORLD.platforms){
    // Choose points: curve vs rect
    const points = plat.type === "curve" ? plat.points : getRotRectCorners(plat);
    if (!points || points.length < 3) continue; // guard against bad data

    const res = satAabbVsPolygon(p, points, w, h);
    if(res){
      p.x += res.axis.x * res.depth;
      p.y += res.axis.y * res.depth;
      if(dot(res.axis,{x:0,y:-1})>0.5){
        grounded=true;
        p.vy=0;
        switch(plat.material){
          case "ice": p.vx*=2; break;
          case "lava": respawnPlayer(p); break;
          case "bounce": p.vy=-800; break;
          case "sticky": p.vx*=0.5; break;
        }
      }
    }
  }

  p.onGround = grounded;
}

function colorFromName(name){
  let hash=0;for(let i=0;i<name.length;i++){hash=(hash*31+name.charCodeAt(i))|0;}
  const r=150+(hash&0x3F), g=150+((hash>>6)&0x3F), b=150+((hash>>12)&0x3F);
  return `rgb(${r},${g},${b})`;
}

const PORT=process.env.PORT||10000;
server.listen(PORT,()=>console.log(`✅ Server running on port ${PORT}`));
