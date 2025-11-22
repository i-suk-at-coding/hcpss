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

// Session middleware with cookie config
const sessionMiddleware = session({
  secret: 'supersecret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,   // must be false if not using HTTPS
    httpOnly: true,
    sameSite: 'lax'
  }
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

// Chat history
let chatHistory = [];

// Always serve index.html
app.get('/', (req, res) => {
  console.log('Session user:', req.session.user); // debug
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Login
app.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (users[username] && users[username] === password) {
    req.session.user = username;
    return res.redirect('/');
  }
  res.status(401).send('Invalid login. <a href="/">Try again</a>');
});

// Register
app.post('/register', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).send('Missing username or password');
  }
  if (users[username]) {
    return res.status(400).send('User already exists. <a href="/">Try login</a>');
  }
  users[username] = password;
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
  req.session.user = username;
  res.redirect('/');
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// Socket.IO
io.on('connection', (socket) => {
  const username = socket.request.session?.user || 'Anonymous';
  console.log('Socket connected, user:', username);
  socket.emit('set username', username);

  // Send chat history
  socket.emit('chat history', chatHistory);

  socket.on('chat message', (msg) => {
    const message = {
      user: username,
      text: msg,
      time: new Date().toISOString() // UTC, client converts to local
    };
    chatHistory.push(message);
    io.emit('chat message', message);
  });
});

// Start server
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
