import http from 'http';
import https from 'https';
import { Express } from 'express';
import fs from 'fs-extra';
import path from 'path';

const root = path.resolve(__dirname, '..', '..');

export function setupServer(app?: Express): http.Server | https.Server {
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

export function setupUploads(): string {
  const uploadPath = path.resolve(root, 'uploads');

  if (!fs.pathExistsSync(uploadPath)) {
    fs.mkdirSync(uploadPath);
  }

  return uploadPath;
}
