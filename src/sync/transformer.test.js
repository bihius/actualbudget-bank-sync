import { describe, it, expect } from 'vitest';
import { transformTransaction } from './transformer.js';

describe('transformer', () => {
  it('should transform a basic debit transaction', () => {
    const ebTx = {
      booking_date: '2024-01-01',
      transaction_amount: { amount: '10.50', currency: 'PLN' },
      credit_debit_indicator: 'DBIT',
      creditor: { name: 'Grocery Store' },
      remittance_information: ['Weekly shopping'],
      transaction_id: 'tx123',
    };

    const result = transformTransaction(ebTx);

    expect(result).toEqual({
      date: '2024-01-01',
      amount: -1050,
      payee_name: 'Grocery Store',
      imported_payee: 'Grocery Store - Weekly shopping',
      notes: 'Weekly shopping',
      imported_id: 'tx123',
      cleared: true,
    });
  });

  it('should transform a credit transaction', () => {
    const ebTx = {
      booking_date: '2024-01-02',
      transaction_amount: { amount: '100.00', currency: 'PLN' },
      credit_debit_indicator: 'CRDT',
      debtor: { name: 'Employer' },
      remittance_information: ['Salary'],
      entry_reference: 'ref456',
    };

    const result = transformTransaction(ebTx);

    expect(result.amount).toBe(10000);
    expect(result.payee_name).toBe('Employer');
    expect(result.imported_id).toBe('ref456');
  });

  it('should fallback to remittance info for payee_name if creditor/debtor name is missing', () => {
    const ebTx = {
      booking_date: '2024-01-03',
      transaction_amount: { amount: '5.00', currency: 'PLN' },
      credit_debit_indicator: 'DBIT',
      remittance_information: ['ATM Withdrawal', 'Location: Warsaw'],
    };

    const result = transformTransaction(ebTx);

    expect(result.payee_name).toBe('ATM Withdrawal');
    expect(result.imported_payee).toBe('ATM Withdrawal - ATM Withdrawal Location: Warsaw');
  });

  it('should generate a stable hash for imported_id if no ID is provided', () => {
    const ebTx = {
      booking_date: '2024-01-04',
      transaction_amount: { amount: '20.00', currency: 'PLN' },
      credit_debit_indicator: 'DBIT',
      remittance_information: ['Coffee'],
    };

    const result1 = transformTransaction(ebTx);
    const result2 = transformTransaction(ebTx);

    expect(result1.imported_id).toBeDefined();
    expect(result1.imported_id).toHaveLength(32);
    expect(result1.imported_id).toBe(result2.imported_id);
  });
});
