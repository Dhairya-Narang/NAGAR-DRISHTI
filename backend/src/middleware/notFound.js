/**
 * Middleware to handle unmatched routes (404 Not Found)
 */
export const notFound = (req, res, next) => {
  res.status(404).json({
    success: false,
    error: {
      message: `Endpoint not found: ${req.method} ${req.originalUrl}`,
      statusCode: 404
    }
  });
};
