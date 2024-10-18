import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { gzip } from 'zlib';
import { promisify } from 'util';
import archiver from 'archiver';
import os from 'os';

const gzipPromise = promisify(gzip);

main()

async function main() {
  if (process.argv.length < 3) {
    console.error('Provide the lizcel.json as an argument!');
    process.exit(1);
  }
  let lizcelConfig = join(process.cwd(), process.argv[2]);
  const config = await readLizcelConfig(lizcelConfig);
  console.log('config', config);
  console.time('Compressed data in');
  const compressedData = await compressDir(config.serve);
  console.timeEnd('Compressed data in');
  console.log(`Compressed size: ${Math.round(compressedData.length / 1024 / 1024)} MiB`);
  console.log('Uploading...');
  console.time('Uploaded archive in');
  await pushToRemote(compressedData, {domain: config.domain});
  console.timeEnd('Uploaded archive in');
}

async function compressDir(sourceDir) {
  return new Promise(async (resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 5 } });
    const chunks = [];

    archive.on('data', (chunk) => chunks.push(chunk));
    archive.on('end', async () => {
      const archiveBuffer = Buffer.concat(chunks);
      const compressedBuffer = await gzipPromise(archiveBuffer);
      resolve(compressedBuffer);
    });
    archive.on('error', (err) => reject(err));

    async function addFilesRecursively(dir, baseDir = '') {
      const files = await readdir(dir, { withFileTypes: true });
      for (const file of files) {
        const filePath = join(dir, file.name);
        const relativePath = join(baseDir, file.name);
        if (file.isDirectory()) {
          await addFilesRecursively(filePath, relativePath);
        } else {
          console.log('-', relativePath);
          archive.file(filePath, { name: relativePath });
        }
      }
    }

    await addFilesRecursively(sourceDir);

    await archive.finalize();
  });
}

async function readAuthString() {
  const homeDir = os.homedir();
  const authFilePath = join(homeDir, '.config', 'lizcel-auth');
  const authString = await readFile(authFilePath, 'utf-8');
  return authString.trim();
}

async function pushToRemote(data, config) {
  config = JSON.stringify(config);
  const authString = await readAuthString();
  const response = await fetch('https://lizcel.liz-lovelace.com/push', {
  // const response = await fetch('http://localhost:10203/push', {
    method: 'POST',
    body: data,
    headers: {
      'Content-Type': 'application/octet-stream',
      'config': config,
      'X-Lizcel-Auth': authString,
    },
  });

  console.log(await response.text());

  if (!response.ok) {
    throw new Error(`HTTP error! ${response.status}`);
  }
}

async function readLizcelConfig(lizcelPath) {
  let config = await readFile(lizcelPath, 'utf-8');
  config = JSON.parse(config);
  if (!config.domain || config.domain.length < 2 || config.domain.length > 3) {
    console.error('Domain is required and must be 2-3 strings long, yours:', config.domain);
    process.exit(1);
  }
  config.serve = join(process.cwd(), config.serve);
  return config;
}
