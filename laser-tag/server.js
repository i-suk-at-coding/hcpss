const express = require('express');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

// Game constants
const WORLD = { width: 1600, height: 900 };
const TICK = 60;
const SPEED = 380;
const LASER_SPEED = 900;
const LASER_LIFETIME = 0.9;
const PLAYER_RADIUS = 18;
const RESPAWN_TIME = 2.5;
const MAX_HP = 100;
const FIRE_COOLDOWN = 0.25;

let players = {};
let lasers = [];
let scores = { red: 0, blue: 0 };

// Utility
function randSpawn() {
  const pads = [
    { x: 120, y: 120 }, { x: 1480, y: 120 }, { x: 120, y: 780 }, { x: 1480, y: 780 },
    { x: 800, y: 450 }, { x: 400, y: 450 }, { x: 1200, y: 450 }
  ];
  const s = pads[Math.floor(Math.random() * pads.length)];
  return { x: s.x, y: s.y };
}
function teamOf(username) { return Math.random() < 0.5 ? 'red' : 'blue'; }

io.on('connection', (socket) => {
  const username = "LT" + Math.floor(Math.random() * 10000);
  const team = teamOf(username);
  const spawn = randSpawn();
  players[socket.id] = {
    id: socket.id, name: username, team,
    x: spawn.x, y: spawn.y, vx: 0, vy: 0,
    hp: MAX_HP, alive: true, respawnAt: 0,
    aim: { x: 0, y: -1 }, firing: false, lastFire: 0,
    input: { up:false,down:false,left:false,right:false }
  };

  socket.emit('init', { me: players[socket.id], world: WORLD, scores });
  io.emit('player_join', publicPlayers());

  socket.on('input', (inp) => {
    const p = players[socket.id]; if (!p) return;
    p.input = { up:!!inp.up, down:!!inp.down, left:!!inp.left, right:!!inp.right };
  });

  socket.on('aim', (aim) => {
    const p = players[socket.id]; if (!p || !aim) return;
    const dx = aim.dx, dy = aim.dy; const len = Math.hypot(dx, dy) || 1;
    p.aim = { x: dx / len, y: dy / len };
  });

  socket.on('fire', (state) => {
    const p = players[socket.id]; if (!p) return;
    p.firing = !!state;
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    io.emit('player_leave', publicPlayers());
  });
});

function publicPlayers() {
  return Object.values(players).map(p => ({
    id: p.id, name: p.name, team: p.team, x: p.x, y: p.y, hp: p.hp, alive: p.alive
  }));
}

function step(dt, now) {
  // Move players
  Object.values(players).forEach(p => {
    if (!p.alive && now >= p.respawnAt) {
      const s = randSpawn();
      p.x = s.x; p.y = s.y; p.hp = MAX_HP; p.alive = true;
    }
    const ax = (p.input.right ? 1 : 0) - (p.input.left ? 1 : 0);
    const ay = (p.input.down ? 1 : 0) - (p.input.up ? 1 : 0);
    const mag = Math.hypot(ax, ay) || 1;
    p.vx = (ax / mag) * SPEED;
    p.vy = (ay / mag) * SPEED;
    if (!p.alive) { p.vx = 0; p.vy = 0; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.x = Math.max(PLAYER_RADIUS, Math.min(WORLD.width - PLAYER_RADIUS, p.x));
    p.y = Math.max(PLAYER_RADIUS, Math.min(WORLD.height - PLAYER_RADIUS, p.y));
    // Firing
    if (p.alive && p.firing && now - p.lastFire > FIRE_COOLDOWN) {
      p.lastFire = now;
      lasers.push({
        from: p.id, team: p.team,
        x: p.x + p.aim.x * (PLAYER_RADIUS + 4),
        y: p.y + p.aim.y * (PLAYER_RADIUS + 4),
        vx: p.aim.x * LASER_SPEED,
        vy: p.aim.y * LASER_SPEED,
        born: now
      });
    }
  });

  // Move lasers, expire
  lasers = lasers.filter(l => now - l.born < LASER_LIFETIME);
  lasers.forEach(l => { l.x += l.vx * dt; l.y += l.vy * dt; });

  // Laser hits
  lasers.forEach(l => {
    Object.values(players).forEach(p => {
      if (!p.alive) return;
      if (p.team === l.team) return; // no friendly fire
      const dist = Math.hypot(p.x - l.x, p.y - l.y);
      if (dist <= PLAYER_RADIUS + 2) {
        p.hp -= 25;
        l.born = -999; // mark for deletion
        if (p.hp <= 0) {
          p.alive = false;
          p.respawnAt = now + RESPAWN_TIME;
          scores[l.team] = (scores[l.team] || 0) + 1;
          io.emit('score', { scores });
        }
      }
    });
  });
  lasers = lasers.filter(l => l.born > -100);
}

let last = Date.now() / 1000;
setInterval(() => {
  const now = Date.now() / 1000;
  const dt = Math.max(0, Math.min(0.05, now - last));
  last = now;
  step(dt, now);
  io.emit('state', { players: publicPlayers(), lasers, scores });
}, 1000 / TICK);

const PORT = process.env.PORT || 11000;
server.listen(PORT, () => console.log(`🔫 LaserTag server on ${PORT}`));
