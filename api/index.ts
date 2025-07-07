import express from "express";
import dotenv from "dotenv";
dotenv.config();

// import express, { Request, Response } from 'express';
import authRoutes from '../src/routes/authRoutes.js';

console.log('🚀 Server starting...');
console.log('Environment check:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
console.log('SUPABASE_ANON_KEY exists:', !!process.env.SUPABASE_ANON_KEY);

const app = express();
app.use(express.json());

app.use('/api/auth', authRoutes);

// app.get('/', (req: Request, res: Response) => {
//   res.send('Hello World!');
// });

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
