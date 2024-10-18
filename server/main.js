import express from 'express';
import { gunzip } from 'zlib';
import { promisify } from 'util';
import { writeFile, readdir, unlink, mkdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import AdmZip from 'adm-zip';

const app = express();
const port = 10203;

const gunzipPromise = promisify(gunzip);

// Middleware to parse raw body
app.use(express.raw({ type: 'application/octet-stream', limit: '150mb' }));

app.post('/push', async (req, res) => {
  try {
    // Parse the config header
    const config = JSON.parse(req.get('config') || '{}');
    const domain = config.domain;

    if (!domain) {
      throw new Error('Domain not specified in config header');
    }

    // Sanitize the domain for use as a directory name
    const sanitizedDomain = domain.replace(/[^a-zA-Z0-9]/g, '_');

    // Decompress the received data
    const decompressedData = await gunzipPromise(req.body);

    // Get the current file's directory
    const currentFilePath = fileURLToPath(import.meta.url);
    const currentDir = dirname(currentFilePath);
    const baseTargetDir = join(currentDir, 'b');
    const targetDir = join(baseTargetDir, sanitizedDomain);

    // Ensure the target directory exists
    await mkdir(baseTargetDir, { recursive: true });
    await mkdir(targetDir, { recursive: true });

    // Remove all files from the target directory
    const existingFiles = await readdir(targetDir);
    for (const file of existingFiles) {
      await unlink(join(targetDir, file));
    }

    // Write the decompressed data to a temporary zip file
    const tempZipPath = join(currentDir, 'temp.zip');
    await writeFile(tempZipPath, decompressedData);

    // Extract the zip file
    const zip = new AdmZip(tempZipPath);
    zip.extractAllTo(targetDir, true);

    // Remove the temporary zip file
    await unlink(tempZipPath);

    res.status(200).send(`Files received, decompressed, and saved successfully to ${sanitizedDomain}`);
  } catch (error) {
    console.error('Error processing the files:', error);
    res.status(500).send(`Error processing the files: ${error.message}`);
  }
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
