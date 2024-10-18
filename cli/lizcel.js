import { readdir, readFile } from 'fs/promises';
import { createWriteStream } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { gzip } from 'zlib';
import { promisify } from 'util';
import archiver from 'archiver';

const gzipPromise = promisify(gzip);

async function compressAndLogSize() {
  try {
    const currentFilePath = fileURLToPath(import.meta.url);
    const currentDir = dirname(currentFilePath);
    const sourceDir = join(currentDir, 'a');

    const archive = archiver('zip', { zlib: { level: 5 } });
    const output = createWriteStream('temp.zip');

    archive.pipe(output);

    const files = await readdir(sourceDir);
    for (const file of files) {
      const filePath = join(sourceDir, file);
      archive.file(filePath, { name: file });
    }

    await archive.finalize();

    await new Promise((resolve) => output.on('close', resolve));

    const archiveContent = await readFile('temp.zip');
    const compressedBuffer = await gzipPromise(archiveContent);


    return compressedBuffer;
  } catch (error) {
    console.error('Error:', error.message);
    throw error;
  }
}

async function pushToRemote(data, domain) {
  try {
    const config = JSON.stringify({ domain });
    const response = await fetch('http://localhost:10203/push', {
      method: 'POST',
      body: data,
      headers: {
        'Content-Type': 'application/octet-stream',
        'config': config,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.text();
    console.log('Server response:', result);
  } catch (error) {
    console.error('Error pushing to remote:', error.message);
  }
}

async function main() {
  try {
    console.time('Compressed data');
    const compressedData = await compressAndLogSize();
    console.timeEnd('Compressed data');
    console.log(`Compressed size: ${Math.round(compressedData.length / 1024 / 1024)} MiB`);
    const domain = 'abc.liz-lovelace.com'; // You can change this or make it dynamic
    console.time('Uploaded archive');
    await pushToRemote(compressedData, domain);
    console.timeEnd('Uploaded archive');
  } catch (error) {
    console.error('Main process error:', error.message);
  }
}

main();
