'use strict';
// Lapisan database tunggal. Produksi: Postgres lewat `pg` (DATABASE_URL, mis. Neon). Tes: PGlite (Postgres WASM).
const fs = require('fs');
const path = require('path');

const SCHEMA = path.join(__dirname, '..', '..', 'db', 'schema.sql');
const int8 = v => parseInt(v, 10);

function wrapPg(pool) {
  return {
    kind: 'pg',
    async q(sql, p) { return (await pool.query(sql, p)).rows; },
    async exec(sql) { await pool.query(sql); },
    async tx(fn) {
      const c = await pool.connect();
      try { await c.query('BEGIN'); const r = await fn(async (s, p) => (await c.query(s, p)).rows); await c.query('COMMIT'); return r; }
      catch (e) { try { await c.query('ROLLBACK'); } catch (_) { } throw e; }
      finally { c.release(); }
    },
    close: () => pool.end()
  };
}
function wrapPglite(pg) {
  return {
    kind: 'pglite',
    async q(sql, p) { return (await pg.query(sql, p)).rows; },
    exec: sql => pg.exec(sql),
    tx: fn => pg.transaction(async t => fn(async (s, p) => (await t.query(s, p)).rows)),
    close: () => pg.close()
  };
}

let shared = null;
function getDb() {
  if (shared) return shared;
  if (!(process.env.SIMA_DATABASE_URL || process.env.DATABASE_URL)) throw new Error('DATABASE_URL belum diatur.');
  const { Pool, types } = require('pg');
  types.setTypeParser(20, int8);
  const pool = new Pool({ connectionString: (process.env.SIMA_DATABASE_URL || process.env.DATABASE_URL), max: Number(process.env.SIMA_DB_POOL || 3), idleTimeoutMillis: 10000, connectionTimeoutMillis: 8000 });
  shared = wrapPg(pool);
  return shared;
}
async function memoryDb() {
  const { PGlite } = require('@electric-sql/pglite');
  const pg = new PGlite({ parsers: { 20: int8 } });
  const db = wrapPglite(pg);
  await db.exec(fs.readFileSync(SCHEMA, 'utf8'));
  return db;
}
async function migrate(db) { await db.exec(fs.readFileSync(SCHEMA, 'utf8')); }
module.exports = { getDb, memoryDb, migrate };
