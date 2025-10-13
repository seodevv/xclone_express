import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs-extra';
import http from 'http';
import https from 'https';
import apiRouter from '@/routes/api';
import morgan from 'morgan';
import os from 'os';
import cluster from 'cluster';
import initializeDatabase from '@/db/initilizer';
import { Server } from 'socket.io';
import { setupSocket } from '@/lib/socket';
import {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@/model/Socket';

const host = process.env.SERVER_HOST || '0.0.0.0';
const port = process.env.SERVER_PORT ? parseInt(process.env.SERVER_PORT) : 9090;
// const origin = process.env.SERVER_ORIGIN
//   ? process.env.SERVER_ORIGIN.split(',')
//   : ['http://localhost', 'https://localhost'];
const origin = 'https://localhost';

export let server: ReturnType<(typeof https | typeof http)['createServer']>;
export const uploadPath = path.join(__dirname, '../uploads');

if (!fs.pathExistsSync(uploadPath)) {
  fs.mkdirSync(uploadPath);
}

if (cluster.isPrimary && process.env.NODE_ENV !== 'test') {
  console.log(`Primary ${process.pid} is running`);
  console.log('origin', origin);

  initializeDatabase()
    .then(() => {
      const MAX_WORKER =
        process.env.MAX_WORKER && ~~process.env.MAX_WORKER !== 0
          ? ~~process.env.MAX_WORKER
          : 1;
      const num_worker =
        os.cpus().length > MAX_WORKER ? MAX_WORKER : os.cpus().length;

      for (let i = 0; i < num_worker; i++) {
        cluster.fork();
      }
    })
    .catch(console.error);

  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died. Restarting...`);
    cluster.fork();
  });
} else {
  const app = express();
  app.use(
    cors({
      origin,
      optionsSuccessStatus: 200,
      credentials: true,
    })
  );
  app.use(express.json());
  app.use(cookieParser());
  app.use(
    morgan(
      `[Worker ${process.pid}] :remote-addr :method :url :status :res[content-length] - :response-time ms`
    )
  );
  app.use('/api', apiRouter);

  server =
    process.env.NODE_ENV === 'production'
      ? http.createServer({}, app)
      : https.createServer(
          {
            key: fs.readFileSync('./localhost-key.pem'),
            cert: fs.readFileSync('./localhost.pem'),
          },
          app
        );
  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(server, {
    cors: {
      origin,
      methods: ['GET', 'POST'],
    },
    maxHttpBufferSize: 1e9,
  });
  setupSocket(io);

  server.listen(port, host, async () => {
    console.log(
      `Worker ${process.pid} is running on : ${
        process.env.NODE_ENV === 'production' ? 'http' : 'https'
      }://${host}:${port}`
    );
  });
}
