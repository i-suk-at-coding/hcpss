const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session middleware
const sessionMiddleware = session({
  secret: 'supersecret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
});
app.use(sessionMiddleware);
io.use((socket, next) => sessionMiddleware(socket.request, {}, next));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Load users
let users = {};
const usersFile = path.join(__dirname, 'users.json');
if (fs.existsSync(usersFile)) {
  users = JSON.parse(fs.readFileSync(usersFile));
} else {
  // create default owner account
  users['owner'] = 'ownerpass';
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
}

// Chat history
let chatHistory = [];

// Always serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Login
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (users[username] && users[username] === password) {
    req.session.user = username;
    return res.redirect('/');
  }
  res.status(401).send('Invalid login. <a href="/">Try again</a>');
});

// Owner adds users
app.post('/adduser', (req, res) => {
  const { username, password } = req.body;
  if (req.session.user !== 'owner') {
    return res.status(403).send('Only owner can add users');
  }
  users[username] = password;
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
  res.send('User added');
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// Socket.IO
io.on('connection', (socket) => {
  const username = socket.request.session?.user || null;
  socket.emit('set username', username);

  if (!username) return; // not logged in, no chat

  socket.emit('chat history', chatHistory);

  socket.on('chat message', (msg) => {
    const message = {
      user: username,
      text: msg,
      time: new Date().toISOString()
    };
    chatHistory.push(message);
    io.emit('chat message', message);
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
