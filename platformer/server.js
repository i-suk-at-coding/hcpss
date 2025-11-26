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

const WORLD = {
  width: 5000,
  height: 2000,
  platforms: [
    {"x":45,"y":151,"w":200,"h":20,"rotation":-152.3116461088466,"material":"ice","rotationHandle":{"x":145,"y":111}},
    {"x":188,"y":211,"w":200,"h":20,"rotation":-165.96375653207352,"material":"ice","rotationHandle":{"x":288,"y":171}},
    {"x":364,"y":239,"w":200,"h":20,"rotation":-177.54596832547296,"material":"ice","rotationHandle":{"x":464,"y":199}},
    {"x":543,"y":244,"w":200,"h":20,"rotation":0,"material":"ice","rotationHandle":{"x":643,"y":204}},
    {"x":696,"y":245,"w":896,"h":19,"rotation":0,"material":"ice","rotationHandle":{"x":1144,"y":205}}
  ],
  spawn: {"x":100,"y":100}
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
  const spawn = WORLD.spawn || { x: 100, y: 500 }; // ✅ use world.spawn
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
  const spawn = WORLD.spawn || { x: 100, y: 500 }; // ✅ use world.spawn
  p.x = spawn.x;
  p.y = spawn.y;
  p.vx = 0;
  p.vy = 0;
  p.onGround = false;
  p.coyoteTimer = 0;
  p.jumpBuffer = 0;
  p.dir = 1;
}


// SAT helpers
function dot(a,b){return a.x*b.x+a.y*b.y;}
function sub(a,b){return {x:a.x-b.x,y:a.y-b.y};}
function normalize(v){const l=Math.hypot(v.x,v.y);return l?{x:v.x/l,y:v.y/l}:{x:0,y:0};}
function getAABBCorners(x,y,w,h){return [{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];}
function getRotRectCorners(p){
  const cx=p.x+p.w/2, cy=p.y+p.h/2, rad=(p.rotation||0)*Math.PI/180;
  const local=[{x:-p.w/2,y:-p.h/2},{x:p.w/2,y:-p.h/2},{x:p.w/2,y:p.h/2},{x:-p.w/2,y:p.h/2}];
  return local.map(v=>({x:cx+v.x*Math.cos(rad)-v.y*Math.sin(rad),y:cy+v.x*Math.sin(rad)+v.y*Math.cos(rad)}));
}
function project(corners,axis){let min=Infinity,max=-Infinity;for(const c of corners){const s=dot(c,axis);if(s<min)min=s;if(s>max)max=s;}return {min,max};}
function overlapAmount(a,b){return Math.min(a.max,b.max)-Math.max(a.min,b.min);}
function satAabbVsRotRect(player,plat,w,h){
  const a=getAABBCorners(player.x,player.y,w,h);
  const b=getRotRectCorners(plat);
  const edge0=sub(b[1],b[0]), edge1=sub(b[3],b[0]);
  const axes=[{x:1,y:0},{x:0,y:1},normalize({x:-edge0.y,y:edge0.x}),normalize({x:-edge1.y,y:edge1.x})];
  let minOverlap=Infinity, smallestAxis=null;
  for(const axis of axes){
    const pa=project(a,axis), pb=project(b,axis);
    const overlap=overlapAmount(pa,pb);
    if(overlap<=0) return null;
    if(overlap<minOverlap){minOverlap=overlap;smallestAxis=axis;}
  }
  const centerDelta={x:(player.x+w/2)-(plat.x+plat.w/2),y:(player.y+h/2)-(plat.y+plat.h/2)};
  if(dot(centerDelta,smallestAxis)<0) smallestAxis={x:-smallestAxis.x,y:-smallestAxis.y};
  return {axis:smallestAxis,depth:minOverlap,rotation:plat.rotation||0};
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
    const res=satAabbVsRotRect(p,plat,w,h);
    if(res){
      p.x+=res.axis.x*res.depth;
      p.y+=res.axis.y*res.depth;
      if(dot(res.axis,{x:0,y:-1})>0.5){
        grounded=true;
        p.vy=0;
        switch(plat.material){
          case "ice": p.vx*=1.1; break;
          case "lava": respawnPlayer(p); break;
          case "bounce": p.vy=-800; break;
          case "sticky": p.vx*=0.5; break;
        }
      }
    }
  }
  p.onGround=grounded;
}

function respawnPlayer(p){p.x=100;p.y=500;p.vx=0;p.vy=0;p.onGround=false;p.coyoteTimer=0;p.jumpBuffer=0;p.dir=1;}

function colorFromName(name){
  let hash=0;for(let i=0;i<name.length;i++){hash=(hash*31+name.charCodeAt(i))|0;}
  const r=150+(hash&0x3F), g=150+((hash>>6)&0x3F), b=150+((hash>>12)&0x3F);
  return `rgb(${r},${g},${b})`;
}

const PORT=process.env.PORT||10000;
server.listen(PORT,()=>console.log(`✅ Server running on port ${PORT}`));
