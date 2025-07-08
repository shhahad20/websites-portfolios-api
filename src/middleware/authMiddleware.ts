import { Request, Response, NextFunction } from 'express';
import { supabase } from "../config/supabaseClient.js";
import { User } from '@supabase/supabase-js';

// Extend Request interface
export interface AuthenticatedRequest extends Request {
  user?: User;
  file?: Express.Multer.File;
}

export const authenticate = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const { data, error } = await supabase.auth.getUser(token);
    
    if (error || !data.user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    req.user = data.user;
    next();
  } catch (err) {
    console.error('Authentication error:', err);
    return res.status(401).json({ error: 'Authentication failed' });
  }
};