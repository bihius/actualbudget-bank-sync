import { readFileSync } from 'fs';

function required(name) {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

const keyPath = process.env.ENABLE_BANKING_KEY_PATH || '/keys/private.pem';

export const config = {
  appId: required('ENABLE_BANKING_APP_ID'),
  privateKey: readFileSync(keyPath, 'utf8'),
  actualServerUrl: process.env.ACTUAL_SERVER_URL || 'http://actual:5006',
  actualPassword: required('ACTUAL_PASSWORD'),
  actualSyncId: required('ACTUAL_SYNC_ID'),
  redirectBaseUrl: required('REDIRECT_BASE_URL'),
  syncCron: process.env.SYNC_CRON || '0 */6 * * *',
  dataDir: process.env.DATA_DIR || '/data',
  port: parseInt(process.env.PORT || '3000', 10),
};
