import { checkPassword, signToken } from "../auth/crypto.js";
import { Unauthorized } from "../middleware/errors.js";
import * as users from "../data/users.js";

export interface LoginInput {
  username: string;
  password: string;
}

export async function login(input: LoginInput): Promise<{ uconst: number; token: string }> {
  const user = await users.getUserByUsername(input.username);
  const ok = user !== undefined && (await checkPassword(input.password, user.passwordHash));
  if (!ok) throw new Unauthorized('Wrong username or password');
  return { uconst: user.uconst, token: signToken({ uconst: user.uconst }) };
}