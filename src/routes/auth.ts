import { Router } from "express";
import { login } from "../services/auth.js";
import { validateLogin } from "../validation.js";
import { uri } from "./dto.js";

export const router = Router();

router.post('/tokens', async (req, res, next) => {
  try {
    const input = validateLogin(req.body);        // 400 on missing fields
    const { uconst, token } = await login(input); // 401 from the service
    res.status(201).json({ token, user: uri.user(uconst) });
  } catch (err) {
    next(err);
  }
});