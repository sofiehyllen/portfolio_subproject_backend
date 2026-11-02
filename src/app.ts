import express from 'express';
import { errorHandler } from './middleware/errors.js';

export const app = express();

app.use(express.json());

app.use((_req, res) => {
  res.status(404).json({ error: 'no such endpoint' });
});

app.use(errorHandler); // last, after every route