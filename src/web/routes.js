import { Router } from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const viewsDir = join(__dirname, 'views');

function readView(name) {
  return readFileSync(join(viewsDir, name), 'utf8');
}

export function createRouter({ enableClient, actualClient, store, config }) {
  const router = Router();

  // Dashboard
  router.get('/', (req, res) => {
    const mappings = store.getAccountMappings().map(m => {
      const session = store.getSession(m.sessionId);
      const expired = !session || new Date(session.validUntil) < new Date();
      return { ...m, expired, bankName: m.bankName, validUntil: session?.validUntil };
    });

    let html = readView('index.html');
    let rows = '';
    if (mappings.length === 0) {
      rows = '<tr><td colspan="5" style="text-align:center;color:#888">No bank connections yet</td></tr>';
    } else {
      for (const m of mappings) {
        const status = m.expired
          ? '<span style="color:#e74c3c">Expired</span>'
          : '<span style="color:#27ae60">Active</span>';
        rows += `<tr>
          <td>${m.bankName}</td>
          <td>${m.iban || '-'}</td>
          <td>${status}</td>
          <td>${m.lastSyncDate || 'Never'}</td>
          <td>
            <form method="POST" action="/disconnect/${m.id}" style="display:inline">
              <button type="submit" class="btn btn-sm btn-danger">Disconnect</button>
            </form>
          </td>
        </tr>`;
      }
    }
    html = html.replace('{{ROWS}}', rows);
    res.send(html);
  });

  // Bank selection
  router.get('/connect', async (req, res) => {
    try {
      const [plBanks, ltBanks, gbBanks] = await Promise.all([
        enableClient.getAspsps('PL').catch(() => []),
        enableClient.getAspsps('LT').catch(() => []),
        enableClient.getAspsps('GB').catch(() => []),
      ]);

      const allBanks = [
        ...(Array.isArray(plBanks) ? plBanks : plBanks?.aspsps || []).map(b => ({ ...b, country: 'PL' })),
        ...(Array.isArray(ltBanks) ? ltBanks : ltBanks?.aspsps || []).map(b => ({ ...b, country: 'LT' })),
        ...(Array.isArray(gbBanks) ? gbBanks : gbBanks?.aspsps || []).map(b => ({ ...b, country: 'GB' })),
      ];

      let html = readView('connect.html');
      let cards = '';
      for (const bank of allBanks) {
        const name = bank.name || bank.aspsp_name || 'Unknown';
        const country = bank.country;
        cards += `<div class="bank-card">
          <form method="POST" action="/connect/start">
            <input type="hidden" name="aspspName" value="${name}">
            <input type="hidden" name="aspspCountry" value="${country}">
            <button type="submit" class="bank-btn">${name} <small>(${country})</small></button>
          </form>
        </div>`;
      }
      html = html.replace('{{BANKS}}', cards || '<p>No banks found</p>');
      res.send(html);
    } catch (err) {
      res.status(500).send(`Error loading banks: ${err.message}`);
    }
  });

  // Start auth
  router.post('/connect/start', async (req, res) => {
    try {
      const { aspspName, aspspCountry } = req.body;
      const redirectUrl = `${config.redirectBaseUrl}/auth/callback`;
      const state = randomUUID();
      const result = await enableClient.startAuth(aspspName, aspspCountry, redirectUrl, state);
      res.redirect(result.url);
    } catch (err) {
      res.status(500).send(`Auth start failed: ${err.message}`);
    }
  });

  // Auth callback
  router.get('/auth/callback', async (req, res) => {
    const { code, error } = req.query;
    if (error) return res.status(400).send(`Bank authorization error: ${error}`);
    if (!code) return res.status(400).send('Missing authorization code');

    try {
      const session = await enableClient.createSession(code);
      store.addSession({
        sessionId: session.session_id,
        aspspName: req.query.aspsp_name || 'Bank',
        validUntil: session.access?.valid_until || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        accounts: session.accounts || [],
        createdAt: new Date().toISOString(),
      });
      res.redirect(`/map/${session.session_id}`);
    } catch (err) {
      res.status(500).send(`Session creation failed: ${err.message}`);
    }
  });

  // Account mapping
  router.get('/map/:sessionId', async (req, res) => {
    const session = store.getSession(req.params.sessionId);
    if (!session) return res.status(404).send('Session not found');

    let actualAccounts;
    try {
      actualAccounts = await actualClient.getAccounts();
    } catch (err) {
      return res.status(500).send(`Failed to get Actual accounts: ${err.message}`);
    }

    let html = readView('map.html');

    let ebOptions = '';
    for (const acc of session.accounts) {
      const label = `${acc.account_id?.iban || acc.uid} (${acc.currency || '?'})`;
      ebOptions += `<option value="${acc.uid}" data-iban="${acc.account_id?.iban || ''}">${label}</option>`;
    }

    let actualOptions = '';
    for (const acc of actualAccounts) {
      actualOptions += `<option value="${acc.id}">${acc.name}</option>`;
    }

    html = html
      .replace('{{SESSION_ID}}', session.sessionId)
      .replace('{{BANK_NAME}}', session.aspspName)
      .replace('{{EB_ACCOUNTS}}', ebOptions)
      .replace('{{ACTUAL_ACCOUNTS}}', actualOptions);

    res.send(html);
  });

  // Save mapping
  router.post('/map', async (req, res) => {
    const { sessionId, enableAccountUid, iban, newAccountName, newAccountType, newAccountBalance } = req.body;
    let { actualAccountId } = req.body;
    const session = store.getSession(sessionId);

    if (newAccountName) {
      const balance = newAccountBalance ? Math.round(parseFloat(newAccountBalance) * 100) : 0;
      actualAccountId = await actualClient.createAccount(newAccountName, newAccountType || 'checking', balance);
    }

    if (!actualAccountId) {
      return res.status(400).send('Select an existing account or fill in a new account name.');
    }

    store.addAccountMapping({
      sessionId,
      enableAccountUid,
      actualAccountId,
      bankName: session?.aspspName || 'Bank',
      iban: iban || '',
      lastSyncDate: null,
    });

    res.redirect('/');
  });

  // Manual sync
  router.post('/sync/now', async (req, res) => {
    const { syncAll } = await import('../sync/syncer.js');
    try {
      const results = await syncAll(enableClient, actualClient, store);
      res.json(results);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Disconnect
  router.post('/disconnect/:id', (req, res) => {
    store.removeAccountMapping(req.params.id);
    res.redirect('/');
  });

  // Status API
  router.get('/api/status', (req, res) => {
    const mappings = store.getAccountMappings().map(m => {
      const session = store.getSession(m.sessionId);
      return {
        ...m,
        sessionValid: session && new Date(session.validUntil) > new Date(),
      };
    });
    res.json({ mappings, sessions: store.getSessions() });
  });

  return router;
}
