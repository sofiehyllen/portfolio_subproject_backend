/**
 * Build the Express application: CORS, JSON and cookie parsong, the API routes, the 404 fallback and the error hnadler
 * 
 * Mounted routes:
 * - `/api/auth`          - login and logout (public)
 * - `/api/titles`        - titles; login optional (searches are logged when logged in)
 * - `/api/users`         - `POST` is public (registration); every other route requires login
 * - `/api/persons`       - persons; login optional
 * - `/api/related-words` - word associations (public)
 */
import express from 'express';
import cookieParser from "cookie-parser";
import cors from 'cors';
import { errorHandler, NotFound } from './middleware/errors.js';
import { optionalAuth, requireAuth } from "./middleware/auth.js";
import { router as authRouter } from './routes/auth.js';
import { router as titlesRouter } from './routes/titles.js';
import { registrationRouter, router as usersRouter } from './routes/users.js';
import { router as personsRouter} from './routes/persons.js';
import { router as wordsRouter } from './routes/words.js';

export const app = express();

// The frontend (Subproject 3) is served from another origin. Only that origin
// may read responses, and it may send the jwt cookie (credentials).
app.use(cors({
  origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true,            // allow the jwt cookie on cross-origin requests
  exposedHeaders: ['Location'], // lets the frontend read Location after POST /api/users
}));

app.use(express.json());
app.use(cookieParser()); // fills req.cookies, read by the auth middleware

app.use('/api/auth', authRouter);
app.use('/api/titles', optionalAuth, titlesRouter);
app.use('/api/users', registrationRouter);       // public: POST /api/users only
app.use('/api/users', requireAuth, usersRouter); // guarded: everything else
app.use('/api/persons', optionalAuth, personsRouter);
app.use('/api/related-words', wordsRouter);

app.use((_req, _res, next) => {
  next(new NotFound('No such endpoint'));
});

app.use(errorHandler); // last, after every route
