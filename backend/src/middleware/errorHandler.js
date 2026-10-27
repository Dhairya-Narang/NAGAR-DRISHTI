import { env } from '../config/env.js';

/**
 * Centralized Global Error Handler
 */
export const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || (res.statusCode && res.statusCode !== 200 ? res.statusCode : 500);
  
  // Format standardized JSON response
  res.status(statusCode).json({
    success: false,
    error: {
      message: err.message || 'Internal Server Error',
      statusCode,
      ...(env.isProduction ? {} : { stack: err.stack })
    }
  });
};
