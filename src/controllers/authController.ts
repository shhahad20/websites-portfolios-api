import { Request, Response } from "express";
import { adminSupabase, supabase } from "../config/supabaseClient.js";

export const register = async (req: Request, res: Response) => {
  const { email, password } = req.body;  
  try {
    const { data, error } = await supabase.auth.signUp({ email, password });
    
    if (error) {
      console.error('Supabase error details:', {
        message: error.message,
        status: error.status,
        details: error
      });
      return res.status(400).json({ error: error.message });
    }
    
    res.json({ user: data.user });
  } catch (err) {
    console.error('Catch block error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ user: data.user, session: data.session });
};
