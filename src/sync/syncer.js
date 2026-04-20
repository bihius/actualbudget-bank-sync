import { transformTransaction } from './transformer.js';
import logger from '../logger.js';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

let syncing = false;

export function _resetSyncing() {
  syncing = false;
}

export async function syncAll(enableClient, actualClient, store) {
  if (syncing) {
    logger.info('Sync already in progress, skipping');
    return { skipped: true };
  }
  syncing = true;
  const results = [];

  try {
    const mappings = store.getAccountMappings();

    for (const mapping of mappings) {
      try {
        const session = store.getSession(mapping.sessionId);
        if (!session || new Date(session.validUntil) < new Date()) {
          logger.warn(`Session expired for ${mapping.bankName} (${mapping.iban}), skipping`);
          results.push({ mapping: mapping.id, status: 'expired' });
          continue;
        }

        const dateFrom = mapping.lastSyncDate ? daysAgo(7) : daysAgo(90);
        const dateTo = today();

        logger.info(
          `Fetching transactions for ${mapping.bankName} ${mapping.iban} from ${dateFrom} to ${dateTo}`
        );
        const ebTransactions = await enableClient.getAllTransactions(
          mapping.enableAccountUid,
          dateFrom,
          dateTo
        );

        const actualTransactions = ebTransactions
          .filter((tx) => tx.status === 'BOOK')
          .map(transformTransaction);

        if (actualTransactions.length === 0) {
          logger.info(`No booked transactions for ${mapping.bankName}`);
          results.push({ mapping: mapping.id, status: 'ok', added: 0, updated: 0 });
          // Add a small delay between accounts anyway
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }

        const result = await actualClient.importTransactions(
          mapping.actualAccountId,
          actualTransactions
        );

        logger.info(
          `Synced ${mapping.bankName}: added=${result.added.length}, updated=${result.updated.length}`
        );
        store.updateLastSyncDate(mapping.id, daysAgo(7));
        results.push({
          mapping: mapping.id,
          status: 'ok',
          added: result.added.length,
          updated: result.updated.length,
        });

        // Add a delay between accounts to avoid hitting rate limits
        await new Promise((r) => setTimeout(r, 5000));
      } catch (err) {
        logger.error({ err }, `Sync failed for ${mapping.bankName}`);
        results.push({ mapping: mapping.id, status: 'error', error: err.message });
      }
    }
  } finally {
    syncing = false;
  }

  store.addSyncLog({ results });
  return { results };
}
