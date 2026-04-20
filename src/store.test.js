import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Store } from './store.js';
import * as fs from 'fs';

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  renameSync: vi.fn(),
  existsSync: vi.fn(),
}));

describe('Store', () => {
  const dataDir = '/tmp/data';
  let store;

  beforeEach(() => {
    vi.resetAllMocks();
    store = new Store(dataDir);
  });

  it('should initialize with empty state', () => {
    expect(store.state).toEqual({
      sessions: {},
      accountMappings: [],
      syncLogs: [],
    });
  });

  it('should load state from file if it exists', () => {
    const mockData = JSON.stringify({
      sessions: { s1: { id: 's1' } },
      accountMappings: [{ id: 'm1' }],
    });
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(mockData);

    store.load();

    expect(store.state.sessions).toHaveProperty('s1');
    expect(store.state.accountMappings).toHaveLength(1);
    expect(store.state.syncLogs).toEqual([]);
  });

  it('should add and get sessions', () => {
    const session = { sessionId: 'sess123', aspspName: 'MyBank' };
    store.addSession(session);

    expect(store.getSession('sess123')).toEqual(session);
    expect(store.getSessions()).toContain(session);
  });

  it('should add sync logs and limit to 10 entries', () => {
    for (let i = 1; i <= 15; i++) {
      store.addSyncLog({ results: [{ mapping: 'm1', added: i }] });
    }

    const logs = store.getSyncLogs();
    expect(logs).toHaveLength(10);
    expect(logs[0].results[0].added).toBe(15);
    expect(logs[9].results[0].added).toBe(6);
  });

  it('should update lastSyncDate for a mapping', () => {
    store.state.accountMappings = [{ id: 'm1', lastSyncDate: null }];
    store.updateLastSyncDate('m1', '2024-01-01');

    expect(store.state.accountMappings[0].lastSyncDate).toBe('2024-01-01');
    expect(fs.writeFileSync).toHaveBeenCalled();
  });
});
