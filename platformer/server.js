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
  {
  "platforms": [
    {
      "type": "curve",
      "material": "ice",
      "points": [
        {
          "x": 73,
          "y": 164
        },
        {
          "x": 75.67249999999999,
          "y": 181.86999999999998
        },
        {
          "x": 85.09,
          "y": 201.68
        },
        {
          "x": 101.2525,
          "y": 223.42999999999998
        },
        {
          "x": 124.16000000000001,
          "y": 247.12000000000006
        },
        {
          "x": 153.8125,
          "y": 272.75
        },
        {
          "x": 190.20999999999998,
          "y": 300.31999999999994
        },
        {
          "x": 233.3525,
          "y": 329.83
        },
        {
          "x": 283.24,
          "y": 361.28
        },
        {
          "x": 339.87249999999995,
          "y": 394.66999999999996
        },
        {
          "x": 403.24999999999994,
          "y": 429.9999999999999
        },
        {
          "x": 473.3724999999999,
          "y": 467.27
        },
        {
          "x": 550.24,
          "y": 506.48
        },
        {
          "x": 633.8525000000001,
          "y": 547.63
        },
        {
          "x": 724.2100000000002,
          "y": 590.72
        },
        {
          "x": 821.3125000000003,
          "y": 635.7500000000001
        },
        {
          "x": 929.1600000000003,
          "y": 637.7200000000001
        },
        {
          "x": 1038.7525000000005,
          "y": 669.6300000000002
        },
        {
          "x": 1187.0900000000004,
          "y": 711.4800000000001
        },
        {
          "x": 1436.1725000000006,
          "y": 670.2700000000003
        }
      ]
    }
  ],
  "spawn": {
    "x": 100,
    "y": 100
  }
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
