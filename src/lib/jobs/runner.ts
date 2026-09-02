import * as dotenv from 'dotenv';
// Load env vars from .env.local for local testing
dotenv.config({ path: '.env.local' });

import { processOutboxQueue } from './worker';

const WORKER_ID = `worker-${Math.random().toString(36).substring(2, 9)}`;
const POLLING_INTERVAL = 3000;

console.log(`[Worker] Started with ID: ${WORKER_ID}`);

async function loop() {
  await processOutboxQueue(WORKER_ID);
  setTimeout(loop, POLLING_INTERVAL);
}

loop();