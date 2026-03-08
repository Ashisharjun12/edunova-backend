import postgres from "postgres";
import { _config } from "./config.js";
import { drizzle } from "drizzle-orm/postgres-js";
//db configuration

export const connection = postgres(_config.DATABASE_URI);
export const db = drizzle(connection); 