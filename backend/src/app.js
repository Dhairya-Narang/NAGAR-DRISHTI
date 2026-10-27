import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { env } from './config/env.js';
import apiRouter from './routes/api.js';
import healthRouter from './routes/health.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
const corsOptions = {
  origin: env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(',').map(o => o.trim()),
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

// HTTP Request logging
if (env.NODE_ENV !== 'test') {
  app.use(morgan(env.isProduction ? 'combined' : 'dev'));
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Root welcome / info
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Welcome to Nagar Drishti Civic Issue Reporting Platform API',
    status: 'online',
    healthCheck: '/api/health',
    apiRoot: '/api'
  });
});

// Direct health check endpoint
app.use('/health', healthRouter);

// Main API routes
app.use('/api', apiRouter);

// 404 Handler
app.use(notFound);

// Centralized Global Error Handler
app.use(errorHandler);

export default app;
