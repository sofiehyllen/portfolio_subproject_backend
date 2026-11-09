import express from 'express';
import { errorHandler, NotFound } from './middleware/errors.js';
import { router as titlesRouter } from './routes/titles.js';
import { router as usersRouter } from './routes/users.js';

export const app = express();

app.use(express.json());

app.use('/api/titles', titlesRouter);
app.use('/api/users', usersRouter);

app.use((_req, _res, next) => {
  next(new NotFound('No such endpoint'));
});

app.use(errorHandler); // last, after every route