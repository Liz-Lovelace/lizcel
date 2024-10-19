import express from 'express';
import { gunzip } from 'zlib';
import { promisify } from 'util';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import AdmZip from 'adm-zip';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { tryToTakeDomain } from './dns.js';
import { addDomainToCaddy } from './caddy.js';
import { report } from '../utils/report.js';

dotenv.config();

const app = express();
const port = 10203;

const gunzipPromise = promisify(gunzip);

process.on('uncaughtException', async (error) => {
  report({error, message: 'Uncaught Exception in node.js'})
  await new Promise(resolve => setTimeout(resolve, 1000))
  process.exit(1)
});

process.on('unhandledRejection', (error) => {
  report({error, message: 'Unhandled Promise Rejection in node.js'})
});

app.use(express.raw({ type: 'application/octet-stream', limit: '150mb' }));

const authenticate = (req, res, next) => {
  const authString = req.get('X-Lizcel-Auth');
  if (!authString) {
    return res.status(401).send('Authentication required');
  }

  const hashedAuth = crypto.createHash('sha256').update(authString).digest('hex');
  if (hashedAuth !== process.env.LIZCEL_API_KEY_HASH) {
    return res.status(403).send('Invalid authentication');
  }

  next();
};

app.post('/push', authenticate, async (req, res) => {
  const config = JSON.parse(req.get('config') || '{}');
  const domain = config.domain;
  if (!domain || ![2,3].includes(domain.length)) {
    throw new Error('Invalid domain');
  }

  if (!domain.every((part) => /^[a-zA-Z0-9-]+$/.test(part))) {
    throw new Error('Invalid domain: each part must only contain A-Z, a-z, 0-9, and hyphens');
  }

  await writeWebsiteDir(req.body, domain.join('_'));

  let dnsMessage = await tryToTakeDomain(domain);
  res.status(200).send(`DNS says: ${dnsMessage}\nOK. In 5 minutes, I'll configure caddy.\nURL: https://${domain.join('.')}`).end();

  console.log('Waiting 5 minutes before configuring caddy...')
  setTimeout(async () => {
    await addDomainToCaddy(domain);
  }, 5 * 60 * 1000);
});

app.use((error, req, res, next) => {
  report({error, message: 'Express Error'})
  res.status(500).send(`Something broke: ${error.message}`)
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});

async function writeWebsiteDir(buffer, dirName) {
    const decompressedData = await gunzipPromise(buffer);

    const targetDir = join(process.env.WEBSITES_PATH, dirName);

    await rm(targetDir, { recursive: true, force: true });

    await mkdir(targetDir, { recursive: true });

    const zip = new AdmZip(decompressedData);
    zip.extractAllTo(targetDir, true);
}
