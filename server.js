const path = require('path');
const express = require('express');
const session = require('express-session');

// Session middleware (one shared instance)
const sessionMiddleware = session({
  secret: 'supersecret',
  resave: false,
  saveUninitialized: true
});

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware);

// Serve login page when not authenticated
app.get('/', (req, res) => {
  if (!req.session.user) {
    return res.sendFile(path.join(__dirname, 'public', 'login.html'));
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Explicit route in case users visit /login.html directly
app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Login handler
app.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (users[username] && users[username] === password) {
    req.session.user = username;
    return res.redirect('/');
  }
  res.status(401).send('Invalid login. <a href="/login.html">Try again</a>');
});

// Register handler
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

// Use the same session for Socket.IO
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});
