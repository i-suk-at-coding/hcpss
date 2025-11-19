const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.static('public'));

let chatHistory = [];

// Load history from file if exists
if (fs.existsSync('history.json')) {
  chatHistory = JSON.parse(fs.readFileSync('history.json', 'utf8'));
}

io.on('connection', (socket) => {
  console.log('A user connected');

  // Send existing history to the new user
  socket.emit('chat history', chatHistory);

  // 🔹 Add your block here:
  socket.on('chat message', (msg) => {
    chatHistory.push(msg); // save message in memory
    fs.writeFileSync('history.json', JSON.stringify(chatHistory)); // persist to file
    io.emit('chat message', msg); // broadcast to all clients
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});
