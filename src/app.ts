import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs-extra';
import https from 'https';
import apiRouter from '@/routes/api';
import morgan from 'morgan';
import { Pool } from 'pg';
import initializeDatabase from '@/db/initilizer';

const app = express();
const host = process.env.SERVER_HOST || '0.0.0.0';
const port = process.env.SERVER_PORT ? parseInt(process.env.SERVER_PORT) : 9090;
export const uploadPath = path.join(__dirname, './uploads');
if (!fs.pathExistsSync(uploadPath)) {
  fs.mkdirSync(uploadPath);
}

export const pool = new Pool();

pool.on('error', (err) => {
  console.error('[node-postgres][error]\n', err);
});

app.use(
  cors({
    origin: ['http://localhost:3000', 'https://localhost:3000'],
    optionsSuccessStatus: 200,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());
app.use(
  morgan(
    ':remote-addr :method :url :status :res[content-length] - :response-time ms'
  )
);

app.use('/api', apiRouter);

const options: https.ServerOptions = {
  key: fs.readFileSync('./localhost-key.pem'),
  cert: fs.readFileSync('./localhost.pem'),
};

const server = https.createServer(options, app);
server.listen(port, host, async () => {
  await initializeDatabase(pool);
  console.log(`server is running on : https://${host}:${port}`);
});

// app.listen(port, host, () =>
//   console.log(`server is running on : http://${host}:${port}`)
// );
