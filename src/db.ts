/**
 * The PostgreSQL connection pool, created once and shared by every data-access module
 * Connection settings come from the `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`
 * environment variables
 */
import { Pool } from 'pg';

export const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});
