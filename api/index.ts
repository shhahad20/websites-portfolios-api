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
app.use("/public", express.static("public"));

app.use(cookieParser());
app.use(morgan("dev"));
// at the top of your file
const allowedOrigins = [
  "https://websites-portfolios.vercel.app",       
  "http://localhost:5173",         
];

app.use(
  cors({
    origin: (incomingOrigin, callback) => {
      // If no Origin header (e.g. server–to–server) or it’s in our list, allow it
      if (!incomingOrigin || allowedOrigins.includes(incomingOrigin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${incomingOrigin} not allowed by CORS`));
      }
    },
    credentials: true,               // so that Set-Cookie is allowed
  })
);

app.options("*", cors());  // enable for all routes

app.use(express.urlencoded({ extended: true }));
app.use(express.json());


app.use('/auth', authRoutes);
app.use('/pdf', promptsRoutes);
app.post("/ai/chat", aiChat);

app.get('/', (_req: Request, res: Response) => {
  res.send('Hello World!');
});


const port = process.env.PORT || 3000;
// app.listen(port, () => {
//   console.log(`Server is running at http://localhost:${port}`);
// });
 export default app;