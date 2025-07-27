import express, { Request, Response } from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import cors from "cors";

dotenv.config();

import authRoutes from '../src/routes/authRoutes.js';
import promptsRoutes from '../src/routes/promptsRoutes.js';
import { aiChat } from "../src/controllers/aiController.js"; // wherever you put it


const app = express();

// ─── CORS SETUP ────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: [
      "https://websites-portfolios.vercel.app",
      "http://localhost:5173",
    ],
    methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
    credentials: true,
  })
);
// Also allow all pre‑flights:
app.options("*", cors());

// ─── OTHER MIDDLEWARE ─────────────────────────────────────────────────────

app.use(cookieParser());
app.use(morgan("dev"));
app.use("/public", express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());


app.use('/auth', authRoutes);
app.use('/pdf', promptsRoutes);
app.use('/api/builder', promptsRoutes);
app.post("/ai/chat", aiChat);
app.get('/test-cors', (req, res) => {
  res.json({ message: 'CORS working!' });
});
app.get('/', (_req: Request, res: Response) => {
  res.send('Hello World!');
});


const port = process.env.PORT || 3000;
// app.listen(port, () => {
//   console.log(`Server is running at http://localhost:${port}`);
// });
 export default app;