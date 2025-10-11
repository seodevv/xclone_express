import { ClientConfig, Pool } from 'pg';
import path from 'path';
import { readFileSync } from 'fs-extra';

export const PGUSER = process.env.PGUSER || 'xclone';
export const SCHEMA_NAME = process.env.PGSCHEMA || 'public';

const caPath = path.resolve(__dirname, './global-bundle.pem');
export const ssl: ClientConfig['ssl'] =
  process.env.NODE_ENV === 'production'
    ? {
        rejectUnauthorized: true,
        ca: readFileSync(caPath).toString(),
      }
    : undefined;

export const pool = new Pool({ ssl });

pool.on('error', (err) => {
  console.error(`[node-postgres][Worker][${process.pid}][error]\n`, err);
});
