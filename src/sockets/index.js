const socketIo = require('socket.io');
const { createModuleLogger } = require('../utils/logger');

const log = createModuleLogger('SocketIO');

let io;

function initSocket(server) {
  io = socketIo(server, {
    cors: {
      origin: '*', // Allow all for development
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    log.info('New client connected', { socketId: socket.id });

    socket.on('disconnect', () => {
      log.info('Client disconnected', { socketId: socket.id });
    });
  });

  log.info('Socket.IO initialized');
}

function getIo() {
  if (!io) {
    throw new Error('Socket.IO not initialized');
  }
  return io;
}

/**
 * Emit task event to all connected clients
 * @param {string} eventName 
 * @param {object} payload 
 */
function emitTaskEvent(eventName, payload) {
  if (io) {
    io.emit(eventName, payload);
  }
}

module.exports = {
  initSocket,
  getIo,
  emitTaskEvent
};
