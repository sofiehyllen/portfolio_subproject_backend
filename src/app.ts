import express from 'express';
import { errorHandler } from './middleware/errors.js';
import { router as titlesRouter } from './routes/titles.js';

export const app = express();

app.use(express.json());

app.use('/api/titles', titlesRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'no such endpoint' });
});

app.use(errorHandler); // last, after every route