import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { syncAll, _resetSyncing } from './syncer.js';

describe('syncer', () => {
  let mockEnableClient;
  let mockActualClient;
  let mockStore;

  beforeEach(() => {
    vi.useFakeTimers();
    _resetSyncing();
    mockEnableClient = {
      getAllTransactions: vi.fn(),
    };
    mockActualClient = {
      importTransactions: vi.fn(),
    };
    mockStore = {
      getAccountMappings: vi.fn(),
      getSession: vi.fn(),
      updateLastSyncDate: vi.fn(),
      addSyncLog: vi.fn(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should skip sync if session is expired', async () => {
    mockStore.getAccountMappings.mockReturnValue([
      { id: 'm1', sessionId: 's1', bankName: 'TestBank' },
    ]);
    mockStore.getSession.mockReturnValue({ validUntil: '2020-01-01' });

    const results = await syncAll(mockEnableClient, mockActualClient, mockStore);

    expect(results.results[0].status).toBe('expired');
    expect(mockEnableClient.getAllTransactions).not.toHaveBeenCalled();
  });

  it('should sync transactions successfully', async () => {
    mockStore.getAccountMappings.mockReturnValue([
      {
        id: 'm1',
        sessionId: 's1',
        bankName: 'TestBank',
        enableAccountUid: 'eb1',
        actualAccountId: 'act1',
        lastSyncDate: '2024-01-01',
      },
    ]);
    mockStore.getSession.mockReturnValue({ validUntil: '2099-01-01' });

    mockEnableClient.getAllTransactions.mockResolvedValue([
      {
        status: 'BOOK',
        booking_date: '2024-01-01',
        transaction_amount: { amount: '10.00' },
        credit_debit_indicator: 'DBIT',
        transaction_id: 'tx1',
      },
    ]);

    mockActualClient.importTransactions.mockResolvedValue({ added: ['tx1'], updated: [] });

    const syncPromise = syncAll(mockEnableClient, mockActualClient, mockStore);

    // Fast-forward through delays
    await vi.runAllTimersAsync();

    const results = await syncPromise;

    expect(results.results[0].status).toBe('ok');
    expect(results.results[0].added).toBe(1);
    expect(mockActualClient.importTransactions).toHaveBeenCalled();
    expect(mockStore.updateLastSyncDate).toHaveBeenCalled();
  });

  it('should handle errors in the sync loop', async () => {
    mockStore.getAccountMappings.mockReturnValue([
      { id: 'm1', sessionId: 's1', bankName: 'TestBank' },
    ]);
    mockStore.getSession.mockReturnValue({ validUntil: '2099-01-01' });
    mockEnableClient.getAllTransactions.mockRejectedValue(new Error('API Down'));

    const syncPromise = syncAll(mockEnableClient, mockActualClient, mockStore);
    await vi.runAllTimersAsync();
    const results = await syncPromise;

    expect(results.results[0].status).toBe('error');
    expect(results.results[0].error).toBe('API Down');
  });
});
