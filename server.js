// server.js
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Serve static files from the "public" folder
app.use(express.static('public'));

// Chat history storage
let chatHistory = [];

// Load history from file if it exists
if (fs.existsSync('history.json')) {
  try {
    chatHistory = JSON.parse(fs.readFileSync('history.json', 'utf8'));
  } catch (err) {
    console.error('Error reading history.json:', err);
    chatHistory = [];
  }
}

io.on('connection', (socket) => {
  console.log('A user connected');

  // Send existing history to the new user
  socket.emit('chat history', chatHistory);

  // Handle incoming messages
  socket.on('chat message', (msg) => {
    chatHistory.push(msg);

    // Save history to file
    try {
      fs.writeFileSync('history.json', JSON.stringify(chatHistory));
    } catch (err) {
      console.error('Error writing history.json:', err);
    }

    // Broadcast to all clients
    io.emit('chat message', msg);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

// Use Render/Heroku port or default to 3000 locally
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
