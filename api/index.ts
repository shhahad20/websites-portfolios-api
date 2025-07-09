import express from "express";
import dotenv from "dotenv";
dotenv.config();

// import express, { Request, Response } from 'express';
import authRoutes from '../src/routes/authRoutes.js';
import promptsRoutes from '../src/routes/promptsRoutes.js';
import { aiChat } from "../src/controllers/aiController.js"; // wherever you put it


const app = express();
app.use(express.json());


app.use('/api/auth', authRoutes);
app.use('/api/pdf', promptsRoutes);
app.post("/api/ai/chat", aiChat);
// app.get('/', (req: Request, res: Response) => {
//   res.send('Hello World!');
// });

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
 