import { verifyToken } from '../services/authService.js';

/**
 * Middleware to authenticate requests using JWT Bearer token
 */
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: {
        message: 'Authentication required. No Bearer token provided.',
        statusCode: 401
      }
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = verifyToken(token);
    req.user = decoded; // { id, email, role, name }
    next();
  } catch (error) {
    const isExpired = error.name === 'TokenExpiredError';
    return res.status(401).json({
      success: false,
      error: {
        message: isExpired ? 'Authentication token has expired. Please log in again.' : 'Invalid authentication token.',
        statusCode: 401
      }
    });
  }
};

/**
 * Middleware to restrict access based on user role ('citizen' | 'admin')
 * @param  {...string} allowedRoles
 */
export const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Authentication required before checking permissions.',
          statusCode: 401
        }
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          message: `Forbidden: Access restricted to [${allowedRoles.join(', ')}] roles. Your current role is '${req.user.role}'.`,
          statusCode: 403
        }
      });
    }

    next();
  };
};

/**
 * Optional authentication middleware for public endpoints that can be enhanced with user context
 */
export const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      req.user = verifyToken(token);
    } catch {
      // Ignore invalid token for optional endpoints
    }
  }
  next();
};
