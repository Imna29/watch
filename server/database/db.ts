import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { postgresConnectionOptions } from "./connection";
import { relations } from "./relations";

const { Pool } = pg;

const pool = new Pool(postgresConnectionOptions(process.env));

export const db = drizzle({ client: pool, relations });
