import express from 'express';
import { errorHandler } from './middleware/errors.js';
import { router as titlesRouter } from './routes/titles.js';
import { router as usersRouter } from './routes/users.js';
import { router as personsRouter} from './routes/persons.js';

export const app = express();

app.use(express.json());

app.use('/api/titles', titlesRouter);
app.use('/api/users', usersRouter);
app.use('/api/persons', personsRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'no such endpoint' });
});

app.use(errorHandler); // last, after every route
