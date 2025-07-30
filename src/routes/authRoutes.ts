import { Router } from 'express';
import { register, login, getProfile, logout, deleteUser, getClientData, confirmEmail, confirmedEmail, authCallback } from '../controllers/authController.js';
import { authenticate } from '../middleware/authMiddleware.js';
const router = Router();

router.post('/register', register);
router.get('/confirm-email', confirmEmail);
router.get('/confirmed-email', confirmedEmail);
router.get('/callback', authCallback);


router.post('/login', login);
router.get('/profile-me',authenticate ,getProfile);
router.post('/logout', logout);
router.get('/:slug',  getClientData);

// From admins only
router.delete('/delete-user',authenticate, deleteUser);
export default router;
