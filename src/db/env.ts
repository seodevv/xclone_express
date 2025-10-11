import path from 'path';
import { Pool } from 'pg';
import { readFileSync } from 'fs-extra';

const ssl = Boolean(process.env.PGSSL);
export const PGUSER = process.env.PGUSER || 'xclone';
export const SCHEMA_NAME = process.env.PGSCHEMA || 'public';

const caPath = path.resolve(__dirname, '../../global-bundle.pem');
export const pool = new Pool({
  ssl: ssl
    ? {
        rejectUnauthorized: true,
        ca: readFileSync(caPath).toString(),
      }
    : undefined,
});

pool.on('error', (err) => {
  console.error(`[node-postgres][Worker][${process.pid}][error]\n`, err);
});
