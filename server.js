// server.js
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const session = require('express-session');
const fs = require('fs');
const path = require('path');

const app = express(); // ✅ define app
const server = http.createServer(app);
const io = socketIO(server);

// Shared session middleware
const sessionMiddleware = session({
  secret: 'supersecret',
  resave: false,
  saveUninitialized: true
});

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware);

// Users
let users = {};
if (fs.existsSync('users.json')) {
  users = JSON.parse(fs.readFileSync('users.json', 'utf8'));
}

// Chat history
let chatHistory = [];
if (fs.existsSync('history.json')) {
  chatHistory = JSON.parse(fs.readFileSync('history.json', 'utf8'));
}

// Routes
app.get('/', (req, res) => {
  if (!req.session.user) {
    return res.sendFile(path.join(__dirname, 'public', 'login.html'));
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
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
    return res.status(400).send('Missing fields. <a href="/login.html">Back</a>');
  }
  if (users[username]) {
    return res.status(409).send('User already exists. <a href="/login.html">Login</a>');
  }
  users[username] = password;
  fs.writeFileSync('users.json', JSON.stringify(users));
  req.session.user = username;
  res.redirect('/');
});

// Socket.IO with sessions
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

io.on('connection', (socket) => {
  const username = socket.request.session?.user || 'Anonymous';
  console.log(`${username} connected`);

  // Send username to client
  socket.emit('set username', username);

  // Send chat history
  socket.emit('chat history', chatHistory);

  // Handle messages
  socket.on('chat message', (msg) => {
    const message = { user: username, text: msg, time: new Date().toLocaleTimeString() };
    chatHistory.push(message);
    fs.writeFileSync('history.json', JSON.stringify(chatHistory));
    io.emit('chat message', message);
  });

  socket.on('disconnect', () => {
    console.log(`${username} disconnected`);
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

