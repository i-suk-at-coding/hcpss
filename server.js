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

  // Send history to new user
  socket.emit('chat history', chatHistory);

  socket.on('chat message', (msg) => {
    chatHistory.push(msg);

    // Save history to file
    fs.writeFileSync('history.json', JSON.stringify(chatHistory));

    io.emit('chat message', msg);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
