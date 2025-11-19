// server.js
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const session = require('express-session');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Middleware
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'supersecret',
  resave: false,
  saveUninitialized: true
}));

// Load users
let users = {};
if (fs.existsSync('users.json')) {
  users = JSON.parse(fs.readFileSync('users.json', 'utf8'));
}

// Load chat history
let chatHistory = [];
if (fs.existsSync('history.json')) {
  chatHistory = JSON.parse(fs.readFileSync('history.json', 'utf8'));
}

// Routes
app.get('/', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login.html');
  }
  res.sendFile(__dirname + '/public/index.html');
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (users[username] && users[username] === password) {
    req.session.user = username;
    return res.redirect('/');
  }
  res.send('Invalid login. <a href="/login.html">Try again</a>');
});

app.post('/register', (req, res) => {
  const { username, password } = req.body;
  if (users[username]) {
    return res.send('User already exists. <a href="/login.html">Login</a>');
  }
  users[username] = password;
  fs.writeFileSync('users.json', JSON.stringify(users));
  req.session.user = username;
  res.redirect('/');
});

// Socket.IO
io.use((socket, next) => {
  const req = socket.request;
  const sessionMiddleware = session({
    secret: 'supersecret',
    resave: false,
    saveUninitialized: true
  });
  sessionMiddleware(req, {}, next);
});

io.on('connection', (socket) => {
  const username = socket.request.session?.user || 'Anonymous';
  console.log(`${username} connected`);

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
