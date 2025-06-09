require('dotenv').config()

const express = require("express");
const { createServer } = require("node:http");
const { Server } = require("socket.io");

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["my-custom-header"],
    credentials: true,
  },
});

const PORT = process.env.PORT || 8000

const users = new Map();

function sendLogToClients(message) {
  io.emit("log", { message });
}

// Middleware to filter based on `user-agent`


io.on("connection", (socket) => {
  sendLogToClients(`User connected: ${socket.id}`);
  console.log(`User connected: ${socket.id}`);

  socket.on("register", (userId) => {
    users.set(userId, socket.id);
    sendLogToClients(users);
    sendLogToClients(`User registered: ${userId} => ${socket.id}`);
    console.log(`User registered: ${userId} => ${socket.id}`)
  });

  sendLogToClients(users);
  console.log(users);

  socket.on("private_message", ({ receiverId, message }) => {
    const receiverSocketId = users.get(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("message", message);
      sendLogToClients(`Message sent to ${receiverSocketId}: ${message}`);

      socket.emit("message_status", {
        status: "DELIVERED",
        message: message,
        receiverId: receiverId,
        timestamp: Date.now()
      });

      console.log(`Message sent to ${receiverSocketId}: ${message}`);
    } else {
      console.log(`USER ${receiverId} IS NOT CONNECTED.`);
      socket.emit("message_status", {
        status: "FAILED",
        message: message,
        receiverId: receiverId,
        error: "User offline",
        timestamp: Date.now()
      });
    }
  });

  socket.on("callForwardingStatus", (e) => {
    socket.emit("status", e);
    console.log(e)
  })

  socket.on("successfully", (e) => {
    console.log(`User removed: ${e}`);
    if(e === "false"){
      console.log("s");
      socket.emit("message_statu", {
        status: "TRUE",
        timestamp: Date.now()
      });}
    if(e === "true"){
      console.log("a");
      socket.emit("message_statu", {
        status: "FALSE",
        timestamp: Date.now()
      });
    }
    });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
    for (let [userId, socketId] of users.entries()) {
      if (socketId === socket.id) {
        users.delete(userId);
        sendLogToClients(`User removed: ${userId}`);
        sendLogToClients(users);
        console.log(`User removed: ${userId}`);
        break;
      }
    }
  });
});

app.get("/", (req, res) => {
  return res.status(400).send("<pre>Cannot GET /</pre>");
});

server.listen(PORT, () => console.log(`Server Start at port: ${PORT}`));
