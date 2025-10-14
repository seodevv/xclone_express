import http from 'http';
import https from 'https';
import { Express } from 'express';
import fs from 'fs-extra';
import path from 'path';

export function setupServer(app: Express): http.Server | https.Server {
  const root = path.resolve(__dirname, '..', '..');

  if (process.env.SSL === 'true') {
    const cert = process.env.SSL_CERT
      ? process.env.SSL_CERT.startsWith('.')
        ? path.resolve(root, process.env.SSL_CERT)
        : process.env.SSL_CERT
      : '';
    const key = process.env.SSL_KEY
      ? process.env.SSL_KEY.startsWith('.')
        ? path.resolve(root, process.env.SSL_KEY)
        : process.env.SSL_KEY
      : '';

    if (fs.existsSync(cert) && fs.existsSync(key)) {
      return https.createServer(
        {
          cert: fs.readFileSync(cert),
          key: fs.readFileSync(key),
        },
        app
      );
    } else {
      throw new Error(
        'SSL is true, but SSL_CERT and SSL_KEY values ​​are invalid.'
      );
    }
  }

  return http.createServer({}, app);
}
