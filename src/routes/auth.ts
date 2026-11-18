/**
 * Authentication routes.
 *
 * POST /api/tokens — authenticates a user and issues a JWT.
 */
import { Router } from 'express';
import { login } from '../services/auth.js';
import { validateLogin } from '../validation.js';
import { uri } from './dto.js';

export const router = Router();

/**
 * POST /api/tokens
 *
 * Authenticates a user and returns a signed JWT.
 *
 * @body    `{ username, password }` — login credentials.
 * @returns `201` with `{ token, user }` on success.
 * @throws  `400 Bad Request`   — missing or invalid fields.
 * @throws  `401 Unauthorized`  — wrong username or password.
 */
router.post('/tokens', async (req, res, next) => {
  try {
    const input = validateLogin(req.body);
    const { uconst, token } = await login(input);
    res.status(201).json({ token, user: uri.user(uconst) });
  } catch (err) {
    next(err);
  }
});
