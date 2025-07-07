import { Router } from 'express';
import { register, login, getProfile, logout, deleteUser } from '../controllers/authController.js';
import { authenticate } from '../middleware/authMiddleware.js';
const router = Router();

router.post('/register', register);
router.post('/login', login);
router.get('/profile-me',authenticate ,getProfile);
router.post('/logout', logout);

// From admins only
router.delete('/delete-user',authenticate, deleteUser);
export default router;
