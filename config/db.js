import pg from "pg";
import env from "dotenv";

env.config();

export const db = new pg.Pool({
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  database: process.env.PG_DB,
  password: process.env.PG_PW,
  port: process.env.PG_PORT,
});