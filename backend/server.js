const express = require('express');
const cors = require('cors');
const env = require('./src/config/env'); // also loads .env
const prisma = require('./src/config/prisma');
const routes = require('./src/routes');
const { notFound, errorHandler } = require('./src/middleware/errorHandler');

if (!env.jwtSecret) {
  console.error('JWT_SECRET is missing. Copy .env.example to .env and set it.');
  process.exit(1);
}

const app = express();

app.use(
  cors({
    origin(origin, callback) {
      // Allow tools like Postman/curl (no Origin header) and the configured frontend origins
      if (!origin || env.clientOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS: origin ${origin} is not allowed`));
    },
  })
);
app.use(express.json());

app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);

const server = app.listen(env.port, () => {
  console.log(`InternLink backend running at http://localhost:${env.port}`);
});

const shutdown = async () => {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
