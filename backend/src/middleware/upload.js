import multer from 'multer';
import { env } from '../config/env.js';

// Allowed MIME types for civic complaint evidence
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/jpg',
  'application/pdf'
];

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    const error = new Error(`Invalid file type: ${file.mimetype}. Allowed types: JPEG, PNG, WEBP, PDF.`);
    error.statusCode = 400;
    cb(error, false);
  }
};

export const uploadAttachmentMiddleware = multer({
  storage,
  limits: {
    fileSize: env.UPLOAD_MAX_SIZE_MB * 1024 * 1024 // e.g. 10MB
  },
  fileFilter
});
