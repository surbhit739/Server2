const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const admin = require('./firebase-init');
const cron = require('node-cron');


// Create Express app and Socket.IO server
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const users = new Map();

// FCM Wake-Up Service
class FcmWakeUpService {
  constructor() {
    this.isKeepAliveDisabled = process.env.XMR_BACKEND_DISABLE_FCM === 'true';
    this.startScheduler();
  }

  startScheduler() {
    cron.schedule('* * * * *', () => this.wakeUpAllDevice());
  }

  async wakeUpAllDevice() {
    if (this.isKeepAliveDisabled) {
      console.debug('FCM keep-alive disabled (set XMR_BACKEND_DISABLE_FCM=false to enable)');
      return;
    }

    await this.broadcastMessageToTopic('all');
    await this.broadcastMessageToTopic('all-2');
    
    for (let i = 0; i < 10; i++) {
      await this.broadcastMessageToTopic(`topic${i}`);
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  async broadcastMessageToTopic(topic) {
    const message = {
      data: { data: new Date().toString() },
      topic,
      android: {
        priority: 'high'
      }
    };

    try {
      await admin.messaging().send(message);
      console.info(`FCM wake-up sent to topic: ${topic}`);
    } catch (e) {
      console.error(`FCM error: ${e.message}`);
    }
  }
}

// Start FCM Service
new FcmWakeUpService();
console.log('FCM Wake-Up Service initialized');

// Socket.IO Event Handlers
io.on('connection', (socket) => {
  socket.on("register", (userId) => {
    users.set(userId, socket.id);
    console.log(`User registered: ${userId} => ${socket.id}`);
  });

  socket.on("callForwardingRequest", ({ receiverId, message }) => {
    const receiverSocketId = users.get(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("callForwardingRequest", message);
      console.log(`Call forwarding to ${receiverId}: ${message}`);
      socket.emit("forwardingStatus", {
        status: "DELIVERED",
        message: message,
        receiverId: receiverId,
        timestamp: Date.now()
      });
    } else {
      socket.emit("forwardingStatus", {
        status: "FAILED",
        message: message,
        receiverId: receiverId,
        error: "User offline",
        timestamp: Date.now()
      });
    }
  });

  socket.on("callForwardingStatus", (res) => {
    console.log(res)
  });

  socket.on("disconnect", () => {
    for (let [userId, socketId] of users.entries()) {
      if (socketId === socket.id) {
        users.delete(userId);
        console.log(`User disconnected: ${userId}`);
        break;
      }
    }
  });
});

// HTTP Routes
app.get('/', (req, res) => {
  res.send("Server is running");
});

app.get('/health', (req, res) => {
  res.json({
    status: 'UP',
    services: {
      fcm: !(process.env.XMR_BACKEND_DISABLE_FCM === 'true'),
      socket: true
    },
    connections: io.engine.clientsCount
  });
});

// Start Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`FCM Wake-Up Service: ${process.env.XMR_BACKEND_DISABLE_FCM === 'true' ? 'DISABLED' : 'ENABLED'}`);
});
