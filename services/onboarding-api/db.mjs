import { Pool } from 'pg';
import { verifiedPoolConfig } from './db-config.mjs';

if (!process.env.DATABASE_RUNTIME_URL) throw new Error('DATABASE_RUNTIME_URL_REQUIRED');

export const pool = new Pool(verifiedPoolConfig(process.env.DATABASE_RUNTIME_URL, {
  max: 5,
  statementTimeout: 10_000,
}));

export const publicPool = new Pool(verifiedPoolConfig(process.env.DATABASE_RUNTIME_URL, {
  max: 2,
  statementTimeout: 2_500,
}));

export async function tenant(merchantId, text, params = []) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.merchant_id',$1,true)", [merchantId]);
    const result = await client.query(text, params);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
