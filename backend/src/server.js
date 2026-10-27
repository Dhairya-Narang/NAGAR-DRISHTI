import app from './app.js';
import { env } from './config/env.js';

const PORT = env.PORT;

const server = app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 Nagar Drishti API Server Running!`);
  console.log(`📡 Environment: ${env.NODE_ENV}`);
  console.log(`🌐 Port: ${PORT}`);
  console.log(`🏥 Health Check: http://localhost:${PORT}/api/health`);
  console.log(`===============================================`);
});

// Graceful shutdown handling
const shutdown = (signal) => {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  server.close(() => {
    console.log('HTTP server closed. Exiting process.');
    process.exit(0);
  });
  
  // Force exit after 10 seconds if hanging
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
