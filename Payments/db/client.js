/**
 * Postgres client for Payments.
 *
 * DATABASE_URL points at the Supabase transaction pooler (port 6543).
 * The transaction pooler does not support prepared statements, so
 * `prepare: false` is required.
 */

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
    throw new Error('[Payments DB] DATABASE_URL is not set');
}

export const sqlClient = postgres(databaseUrl, {
    prepare: false,
    max: Number(process.env.DB_POOL_MAX || 10),
    idle_timeout: 20,
    connect_timeout: 15,
});

export const db = drizzle(sqlClient, { schema });

/** Fails fast at boot if the database is unreachable. */
export async function checkDbConnection() {
    await sqlClient`select 1`;
}

export async function closeDb() {
    await sqlClient.end({ timeout: 5 });
}
