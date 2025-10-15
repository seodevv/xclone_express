import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import cookieParser from 'cookie-parser';
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
import { setupServer, setupUploads } from '@/lib/setup';

const host = process.env.SERVER_HOST || '0.0.0.0';
const port =
  process.env.SERVER_PORT && ~~process.env.SERVER_PORT !== 0
    ? ~~process.env.SERVER_PORT
    : 9090;
const origin = process.env.SERVER_ORIGIN
  ? process.env.SERVER_ORIGIN.split(',')
  : 'https://localhost';

export const uploadPath = setupUploads();
export let server: ReturnType<(typeof https | typeof http)['createServer']>;

const MAX_WORKER = process.env.MAX_WORKER ? ~~process.env.MAX_WORKER : 1;
const numWorkers =
  os.cpus().length > MAX_WORKER ? MAX_WORKER : os.cpus().length;

if (cluster.isPrimary && process.env.NODE_ENV !== 'test') {
  initializeDatabase()
    .then(() => {
      for (let i = 0; i < numWorkers; i++) {
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
  app.set('trust proxy', true);
  app.use(
    cors({
      origin,
      optionsSuccessStatus: 200,
      credentials: true,
    })
  );
  app.use(cookieParser());
  app.use(express.json());
  app.use(
    morgan(
      `[Worker ${process.pid}] :remote-addr :method :url :status :res[content-length] - :response-time ms`
    )
  );
  app.use('/api', apiRouter);

  server = setupServer(app);
  server.listen(port, host, () => {
    console.log(
      `Express worker is running on : [worker:${process.pid}] ${
        server instanceof http.Server ? 'http' : 'https'
      }://${host}:${port}`
    );
  });

  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(server, {
    cors: {
      origin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    maxHttpBufferSize: 1e9,
  });
  setupSocket(io);
}
