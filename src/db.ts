/**
 * The PostgreSQL connection pool, shared by every data-access module.
 * Configuration comes from `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER` and `PGPASSWORD`.
 */
import { Pool } from 'pg';

export const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});
