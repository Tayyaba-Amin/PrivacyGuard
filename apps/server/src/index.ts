import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

import { createApp } from './app.js';
import { config } from './config/env.js';

const app = createApp();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const webDistPath = path.resolve(__dirname, '../../web/dist');

app.use(express.static(webDistPath));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }

  res.sendFile(path.join(webDistPath, 'index.html'));
});

app.listen(config.port, config.host, () => {
  console.log(`PrivacyGuard listening on ${config.host}:${config.port}`);
});