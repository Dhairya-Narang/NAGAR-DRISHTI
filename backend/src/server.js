import app from './app.js';
import { env } from './config/env.js';

const initialPort = parseInt(env.PORT, 10) || 5000;

const startServer = (port) => {
  const server = app.listen(port, () => {
    console.log(`===============================================`);
    console.log(`🚀 Nagar Drishti API Server Running!`);
    console.log(`📡 Environment: ${env.NODE_ENV}`);
    console.log(`🌐 Port: ${port}`);
    console.log(`🏥 Health Check: http://localhost:${port}/api/health`);
    console.log(`===============================================`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`⚠️ Port ${port} is occupied (macOS AirPlay often uses 5000). Trying port ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('Server error:', err);
    }
  });

  // Graceful shutdown handling
  const shutdown = (signal) => {
    console.log(`\nReceived ${signal}. Shutting down gracefully...`);
    server.close(() => {
      console.log('HTTP server closed. Exiting process.');
      process.exit(0);
    });
    setTimeout(() => {
      console.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

startServer(initialPort);
