import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { openDb } from './db.js';
import { seed } from './seed.js';
import { createApp } from './app.js';

const db = openDb();
if (seed(db)) console.log('Seeded demo users: alice@ajaia.dev, bob@ajaia.dev, carol@ajaia.dev');

const app = createApp(db);

// In production the API also serves the built React app.
const dist = path.resolve('dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => console.log(`Ajaia Docs running on http://localhost:${port}`));
