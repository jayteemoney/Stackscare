import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    uploadRecord,
    analyzeDocument,
    analyzeSymptoms,
    orchestrateAnalysis,
    listMolbots,
    discoverMolbot
} from '../api';

// Mock x402Fetch
vi.mock('../x402Client', () => ({
    x402Fetch: vi.fn(),
    X402_PAYMENT_INFO: { enabled: true }
}));

describe('api.ts utilities - Precision Coverage', () => {
    const mockFile = new File(['test'], 'test.pdf', { type: 'application/pdf' });

    beforeEach(() => {
        vi.clearAllMocks();
        global.fetch = vi.fn();
    });

    describe('uploadRecord', () => {
        it('should hit catch in res.json()', async () => {
            (global.fetch as any).mockResolvedValue({
                ok: false,
                statusText: 'Malformed JSON',
                json: () => Promise.reject(new Error('JSON Parse Error'))
            });
            // Line 75: catch returns { detail: res.statusText }
            // Line 76: throw err.detail ('Malformed JSON')
            await expect(uploadRecord(mockFile)).rejects.toThrow('Malformed JSON');
        });
    });

    describe('analyzeDocument', () => {
        it('should hit catch in res.json()', async () => {
            const { x402Fetch } = await import('../x402Client');
            (x402Fetch as any).mockResolvedValue({
                ok: false,
                statusText: 'Doc Fail',
                json: () => Promise.reject(new Error())
            });
            await expect(analyzeDocument(mockFile)).rejects.toThrow('Doc Fail');
        });
    });

    describe('analyzeSymptoms', () => {
        it('should hit catch in res.json()', async () => {
            const { x402Fetch } = await import('../x402Client');
            (x402Fetch as any).mockResolvedValue({
                ok: false,
                statusText: 'Symp Fail',
                json: () => Promise.reject(new Error())
            });
            await expect(analyzeSymptoms('cough')).rejects.toThrow('Symp Fail');
        });
    });

    describe('orchestrateAnalysis', () => {
        it('should hit catch in res.json()', async () => {
            (global.fetch as any).mockResolvedValue({
                ok: false,
                statusText: 'Orch Crash',
                json: () => Promise.reject(new Error())
            });
            await expect(orchestrateAnalysis('fever')).rejects.toThrow('Orch Crash');
        });
    });
});
