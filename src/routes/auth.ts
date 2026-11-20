/**
 * Authentication routes.
 *
 * POST   /api/auth/token — authenticates a user and sets the JWT cookie.
 * DELETE /api/auth/token — clears the JWT cookie.
 */
import { Router } from 'express';
import { login } from '../services/auth.js';
import { validateLogin } from '../validation.js';
import { uri } from './dto.js';
import { clearTokenCookie, setTokenCookie } from "../middleware/auth.js";

/** Router for `/api/auth`. Public: no login needed. */
export const router = Router();

/**
 * POST /api/auth/token
 *
 * Authenticates a user and stores a signed JWT in an HttpOnly cookie.
 * The token is not in the body: scripts in the browser never see it.
 *
 * @body    `{ username, password }` — login credentials.
 * @returns `200` with `{ user }` and a `Set-Cookie: jwt=...` header on success.
 * @throws  `400 Bad Request`   — missing or invalid fields.
 * @throws  `401 Unauthorized`  — wrong username or password.
 */
router.post('/token', async (req, res, next) => {
  try {
    const input = validateLogin(req.body);
    const { uconst, token } = await login(input);
    setTokenCookie(res, token);
    res.status(200).json({ user: uri.user(uconst) });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/auth/token
 *
 * Clears the token cookie. Public and idempotent: logging out without being
 * logged in also succeeds. The JWT itself stays valid until it expires;
 * the server keeps no state, so it cannot revoke it.
 *
 * @returns `204` with a `Set-Cookie` header that expires the cookie.
 */
router.delete('/token', (_req, res) => {
  clearTokenCookie(res);
  res.status(204).end();
});
