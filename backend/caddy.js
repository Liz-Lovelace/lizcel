import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';

dotenv.config();

const execAsync = promisify(exec);

// serveDomain(['abc1', 'abcd', 'gallery']).then(console.log)

export async function addDomainToCaddy(domain) {
  console.log(`adding domain ${domain} to caddy...`);
  const caddyfilePath = process.env.CADDYFILE_PATH;

  let caddyfileContent = await fs.readFile(caddyfilePath, 'utf-8');

  const fullDomain = domain.join('.');

  if (caddyfileContent.includes(fullDomain)) {
    console.log(`Domain ${fullDomain} already exists in Caddyfile`);
    return;
  }

  const newEntry = `${fullDomain} {
\troot * ${process.env.WEBSITES_PATH}/${domain.join('_')}
\tfile_server
}
`;

  await fs.appendFile(caddyfilePath, newEntry);

  await execAsync(`caddy reload --config ${caddyfilePath}`);
  console.log('Caddy reloaded successfully');
}

