import express from 'express';
import { errorHandler, NotFound } from './middleware/errors.js';
import { router as titlesRouter } from './routes/titles.js';
import { router as usersRouter } from './routes/users.js';
import { router as personsRouter} from './routes/persons.js';
import { router as wordsRouter } from './routes/words.js';

export const app = express();

app.use(express.json());

app.use('/api/titles', titlesRouter);
app.use('/api/users', usersRouter);
app.use('/api/persons', personsRouter);
app.use('/api/related-words', wordsRouter);

app.use((_req, _res, next) => {
  next(new NotFound('No such endpoint'));
});

app.use(errorHandler); // last, after every route
