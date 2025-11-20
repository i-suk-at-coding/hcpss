const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session middleware
const sessionMiddleware = session({
  secret: 'supersecret',
  resave: false,
  saveUninitialized: false   // important: don’t create empty sessions
});
app.use(sessionMiddleware);

// Share session with Socket.IO
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Load users from file
let users = {};
const usersFile = path.join(__dirname, 'users.json');
if (fs.existsSync(usersFile)) {
  users = JSON.parse(fs.readFileSync(usersFile));
}

// Routes
app.get('/', (req, res) => {
  if (!req.session.user) {
    return res.sendFile(path.join(__dirname, 'public', 'login.html'));
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (users[username] && users[username] === password) {
    req.session.user = username;
    return res.redirect('/');
  }
  res.status(401).send('Invalid login. <a href="/login.html">Try again</a>');
});

app.post('/register', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).send('Missing username or password');
  }
  if (users[username]) {
    return res.status(400).send('User already exists. <a href="/login.html">Try login</a>');
  }
  users[username] = password;
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
  req.session.user = username;
  res.redirect('/');
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// Socket.IO
io.on('connection', (socket) => {
  const username = socket.request.session?.user || 'Anonymous';
  socket.emit('set username', username);

  socket.on('chat message', (msg) => {
    io.emit('chat message', { user: username, text: msg });
  });
});

// Start server
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
