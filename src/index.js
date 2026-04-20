import express from 'express';
import cron from 'node-cron';
import { config } from './config.js';
import { EnableBankingClient } from './enable-banking/client.js';
import { ActualClient } from './actual/client.js';
import { Store } from './store.js';
import { createRouter } from './web/routes.js';
import { syncAll } from './sync/syncer.js';
import logger from './logger.js';

const store = new Store(config.dataDir);
store.load();

const enableClient = new EnableBankingClient(config.appId, config.privateKey);
const actualClient = new ActualClient();

logger.info('Initializing Actual Budget connection...');
await actualClient.init(config.actualServerUrl, config.actualPassword, config.actualSyncId);
logger.info('Actual Budget connected.');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(createRouter({ enableClient, actualClient, store, config }));

app.listen(config.port, () => {
  logger.info(`Server running on port ${config.port}`);
});

cron.schedule(config.syncCron, async () => {
  logger.info('Starting scheduled sync...');
  try {
    await actualClient.sync();
    const results = await syncAll(enableClient, actualClient, store);
    logger.info({ results }, 'Scheduled sync complete');
  } catch (err) {
    logger.error({ err }, 'Scheduled sync failed');
  }
});

logger.info(`Cron sync scheduled: ${config.syncCron}`);
