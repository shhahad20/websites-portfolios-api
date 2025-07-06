import { Request, Response, NextFunction } from 'express';
import { supabase } from '../controllers/authController';

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided' });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ error: 'Invalid or expired token' });
  (req as any).user = data.user;
  next();
};
