import dotenv from 'dotenv';
import { report } from '../utils/report.js';

dotenv.config();

export async function tryToTakeDomain(domainArray) {
  if (domainArray.length != 3) {
    throw new Error(`Domain array must have 3 elements: ${domainArray}`);
  }

  let baseDomain = `${domainArray[1]}.${domainArray[2]}`;
  let fullDomain = `${domainArray[0]}.${domainArray[1]}.${domainArray[2]}`;

  const zoneId = await getZoneIdForDomain(baseDomain);

  let records = await getDNSRecords(zoneId);

  let existingRecord = records.find(record => record.name === fullDomain);
  if (existingRecord) {
    return `Domain ${fullDomain} already exists, it's pointing to ${existingRecord.content}`;
  }

  await takeDomain(zoneId, fullDomain);

  return `Domain ${fullDomain} added`;
}

async function getDNSRecords(zoneId) {
  console.log(`Fetching DNS records (type A only) for zone ${zoneId}`)
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
    {
      headers: {
        'X-AUTH-EMAIL': process.env.CLOUDFLARE_EMAIL,
        'Authorization': `Bearer ${process.env.CLOUDFLARE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error('Error response:', data)
    throw new Error(`HTTP error! status: ${response.status}`);
  }


  if (data.success) {
    return data.result.filter(record => record.type === 'A');
  } else {
    throw new Error('Failed to fetch DNS records');
  }
}

async function takeDomain(zoneId, fullDomain) {
  report({message: `Adding type A record for ${fullDomain} that points to ${process.env.LIZCEL_IP}`});
  console.log(`Adding type A record for ${fullDomain} that points to ${process.env.LIZCEL_IP}`);
  
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
    {
      method: 'POST',
      headers: {
        'X-AUTH-EMAIL': process.env.CLOUDFLARE_EMAIL,
        'Authorization': `Bearer ${process.env.CLOUDFLARE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'A',
        name: fullDomain,
        content: process.env.LIZCEL_IP,
        ttl: 1, // Auto TTL
        proxied: false,
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error('Error response:', data);
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  if (data.success) {
    console.log(`Successfully added type A record for ${fullDomain}`);
    return data.result;
  } else {
    throw new Error('Failed to add DNS record');
  }
}

async function getZoneIdForDomain(domain) {
  console.log(`Fetching zone id for ${domain}`)
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/zones?name=${domain}`,
    {
      headers: {
        'X-AUTH-EMAIL': process.env.CLOUDFLARE_EMAIL,
        'Authorization': `Bearer ${process.env.CLOUDFLARE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error('Error response:', data)
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  if (data.success && data.result.length > 0) {
    return data.result[0].id;
  } else {
    throw new Error('Zone not found for the given domain');
  }
}
