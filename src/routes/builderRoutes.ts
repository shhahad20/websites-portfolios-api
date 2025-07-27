import express from 'express';
import multer from 'multer';
import {
  getBuilderSettings,
  saveBuilderSettings,
  deleteBuilderSettings,
  uploadAvatar
} from '../controllers/builderController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Apply authentication middleware to all routes
router.use(authenticate);

// Routes
router.get('/settings', getBuilderSettings);
router.post('/settings', saveBuilderSettings);
router.delete('/settings', deleteBuilderSettings);
router.post('/upload-avatar', upload.single('avatar'), uploadAvatar);

export default router;