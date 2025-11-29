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
  platforms: [
    {
    type: "rect",
    material: "normal",
    x: 66, y: 948, w: 200, h: 20
  },
    {
    type: "rect",
    material: "normal",
    x: 225, y: 948, w: 200, h: 20
  },
    {
    type: "rect",
    material: "normal",
    x: 396, y: 948, w: 200, h: 20
  },
    {
    type: "rect",
    material: "normal",
    x: 593, y: 946, w: 200, h: 20
  },
    {
      type: "curve",
      material: "ice",
      points: [ { x: 97, y: 186 }, { x: 167.62, y: 189.82 }, { x: 236.48, y: 196.88 }, { x: 303.58, y: 207.18 }, { x: 368.92, y: 220.72 }, { x: 432.5, y: 237.5 }, { x: 494.32, y: 257.52 }, { x: 554.38, y: 280.78 }, { x: 612.68, y: 307.28 }, { x: 669.22, y: 337.02 }, { x: 724, y: 370 }, { x: 777.02, y: 406.22 }, { x: 828.28, y: 445.68 }, { x: 877.78, y: 488.38 }, { x: 925.52, y: 534.32 }, { x: 971.5, y: 583.5 }, { x: 1015.72, y: 635.92 }, { x: 1058.18, y: 691.58 }, { x: 1098.88, y: 750.48 }, { x: 1137.82, y: 812.62 } ]
    },
    {
      type: "curve",
      material: "ice",
      points: [ { x: 999, y: 733 }, { x: 951.6175, y: 567.56 }, { x: 863.67, y: 482.84 }, { x: 1295.1575, y: 822.84 }, { x: 877.08, y: 508.56 }, { x: 1386.4375, y: 840 }, { x: 944.23, y: 558.16 }, { x: 1467.4575, y: 864.04 }, { x: 1504.12, y: 878.64 }, { x: 1538.2175, y: 894.96 }, { x: 1569.75, y: 913 }, { x: 1598.7175, y: 932.76 }, { x: 1625.12, y: 954.24 }, { x: 1648.9575, y: 977.44 }, { x: 1670.23, y: 1002.36 }, { x: 1688.9375, y: 1029 }, { x: 1705.08, y: 1057.36 }, { x: 1718.6575, y: 1087.44 }, { x: 2438.67, y: 1872.24 }, { x: 2412.1175, y: 1874.76 } ]
    },
    {
      type: "curve",
      material: "ice",
      points: [ { x: 2316, y: 1772.3333 }, { x: 2420.3725, y: 1876.0933 }, { x: 2533.89, y: 1883.9733 }, { x: 2592.5525, y: 1891.9733 }, { x: 2651.36, y: 1899.0933 }, { x: 2710.3125, y: 1905.3333 }, { x: 2769.41, y: 1910.6933 }, { x: 2828.6525, y: 1915.1733 }, { x: 2888.04, y: 1918.7733 }, { x: 2947.5725, y: 1921.4933 }, { x: 3007.25, y: 1923.3333 }, { x: 3067.0725, y: 1924.2933 }, { x: 3127.04, y: 1924.3733 }, { x: 3187.1525, y: 1923.5733 }, { x: 3247.41, y: 1921.8933 }, { x: 3307.8125, y: 1919.3333 }, { x: 3368.36, y: 1915.8933 }, { x: 3429.0525, y: 1911.5733 }, { x: 3489.89, y: 1906.3733 }, { x: 3550.8725, y: 1900.2933 } ]
    },
    {
      type: "curve",
      material: "ice",
      points: [ { x: 2166, y: 1599.3333 }, { x: 2197.01, y: 1620.5008 }, { x: 2225.64, y: 1640.4033 }, { x: 2251.89, y: 1659.0408 }, { x: 2275.76, y: 1676.4133 }, { x: 2297.25, y: 1692.5208 }, { x: 2316.36, y: 1707.3633 }, { x: 2333.09, y: 1720.9408 }, { x: 2347.44, y: 1733.2533 }, { x: 2359.41, y: 1744.3008 }, { x: 2369, y: 1754.0833 }, { x: 2376.21, y: 1762.6008 }, { x: 2381.04, y: 1769.8533 }, { x: 2526.49, y: 1817.8408 }, { x: 2383.56, y: 1780.5633 }, { x: 2381.25, y: 1784.0208 }, { x: 2376.56, y: 1786.2133 }, { x: 2369.49, y: 1787.1408 }, { x: 2360.04, y: 1786.8033 }, { x: 2348.21, y: 1785.2008 } ]
    },
    {
      type: "curve",
      material: "ice",
      points: [ { x: 2013, y: 1475.3333 }, { x: 2045.015, y: 1505.4583 }, { x: 2077.86, y: 1534.4333 }, { x: 2111.535, y: 1562.2583 }, { x: 2146.04, y: 1588.9333 }, { x: 2181.375, y: 1614.4583 }, { x: 2217.54, y: 1638.8333 }, { x: 2254.535, y: 1662.0583 }, { x: 2292.36, y: 1684.1333 }, { x: 2331.015, y: 1705.0583 }, { x: 2370.5, y: 1724.8333 }, { x: 2410.815, y: 1743.4583 }, { x: 2451.96, y: 1760.9333 }, { x: 2493.935, y: 1777.2583 }, { x: 2536.74, y: 1792.4333 }, { x: 2580.375, y: 1806.4583 }, { x: 2624.84, y: 1819.3333 }, { x: 2670.135, y: 1831.0583 }, { x: 2716.26, y: 1841.6333 }, { x: 2763.215, y: 1851.0583 } ]
    }
  ],
  spawn: { x: 100, y: 100 }
}


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
          case "ice": p.vx*=1.5; break;
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
