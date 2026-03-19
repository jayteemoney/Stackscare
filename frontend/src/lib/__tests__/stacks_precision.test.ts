import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    fetchTotalRecords,
    fetchTxStatus
} from '../stacks';

// Mock @stacks/connect v8
vi.mock('@stacks/connect', () => ({
    isConnected: vi.fn(),
    getLocalStorage: vi.fn(),
    openContractCall: vi.fn(),
}));

// Mock @stacks/transactions
vi.mock('@stacks/transactions', () => ({
    principalCV: vi.fn(),
    fetchCallReadOnlyFunction: vi.fn(),
    cvToJSON: vi.fn(),
}));

describe('stacks.ts Precision Coverage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        global.fetch = vi.fn();
    });

    it('fetchTotalRecords should use fallback 0', async () => {
        const { cvToJSON } = await import('@stacks/transactions');
        (cvToJSON as any).mockReturnValue({ value: null });
        expect(await fetchTotalRecords('ST1')).toBe(0);
    });

    it('fetchTxStatus should hit catch and return pending', async () => {
        (global.fetch as any).mockImplementationOnce(() => {
            throw new Error('Network error');
        });
        expect(await fetchTxStatus('TX1')).toBe('pending');
    });
});
