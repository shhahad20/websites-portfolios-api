import express, { Request, Response } from 'express';
import authRoutes from './routes/authRoutes';

const app = express();
app.use(express.json());

app.use('/auth', authRoutes);

app.get('/', (req: Request, res: Response) => {
  res.send('Hello World!');
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
