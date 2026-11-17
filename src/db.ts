// The connection pool. Created once, imported everywhere.

import { Pool, PoolClient } from 'pg';

export const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

// What a data function runs its queries on: the pool, or one client that
// holds a transaction. Both have the same query() method.
export type Db = Pool | PoolClient;