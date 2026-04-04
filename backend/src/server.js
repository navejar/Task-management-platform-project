const express = require('express');
const cors = require('cors');
const http = require('http');
const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const pool = require('./config/db');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'default_secret_change_me';

// ──────────────────────────────────────────
// Middleware
// ──────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ──────────────────────────────────────────
// WebSocket Server
// ──────────────────────────────────────────
const wss = new WebSocketServer({ server, path: '/ws' });

// Authenticated WebSocket connections
const clients = new Map(); // ws -> { userId, role }

wss.on('connection', (ws, req) => {
  // Extract token from query string: ws://host/ws?token=xxx
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');

  if (!token) {
    ws.close(4001, 'Authentication required');
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    clients.set(ws, { userId: decoded.id, username: decoded.username, role: decoded.role });
    console.log(`WebSocket client connected: ${decoded.username} (${decoded.role})`);

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`WebSocket client disconnected: ${decoded.username}`);
    });

    ws.on('error', (err) => {
      console.error('WebSocket error:', err);
      clients.delete(ws);
    });

    // Send a welcome message
    ws.send(JSON.stringify({ type: 'CONNECTED', payload: { message: 'WebSocket connected successfully' } }));
  } catch (err) {
    ws.close(4003, 'Invalid token');
  }
});

// Broadcast function available to all routes
const broadcast = (message) => {
  const data = JSON.stringify(message);
  clients.forEach((clientInfo, ws) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(data);
    }
  });
};

app.locals.broadcast = broadcast;

// ──────────────────────────────────────────
// Database Initialization
// ──────────────────────────────────────────
const initDB = async () => {
  try {
    const initSQL = fs.readFileSync(path.join(__dirname, 'config', 'init.sql'), 'utf8');
    await pool.query(initSQL);
    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Database initialization error:', err.message);
    // Don't crash — the DB might already be initialized
  }
};

// ──────────────────────────────────────────
// Routes
// ──────────────────────────────────────────
const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');
const approvalRoutes = require('./routes/approvals');
const adminRoutes = require('./routes/admin');
const metricsRoutes = require('./routes/metrics');

app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/metrics', metricsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve React frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../frontend/build')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/build', 'index.html'));
  });
}

// ──────────────────────────────────────────
// Start Server
// ──────────────────────────────────────────
const start = async () => {
  await initDB();
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`WebSocket server running on ws://localhost:${PORT}/ws`);
  });
};

start();


module.exports = { app, server };
