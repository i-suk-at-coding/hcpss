const express = require('express');
const http = require('http');
const socketIO = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.static('public'));

let chatHistory = []; // store messages

io.on('connection', (socket) => {
  console.log('A user connected');

  // Send existing history to new user
  socket.emit('chat history', chatHistory);

  socket.on('chat message', (msg) => {
    chatHistory.push(msg); // save message
    io.emit('chat message', msg); // broadcast
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
