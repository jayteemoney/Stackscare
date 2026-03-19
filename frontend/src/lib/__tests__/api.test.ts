import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    uploadRecord,
    analyzeDocument,
    analyzeSymptoms,
    orchestrateAnalysis,
    listMolbots,
    discoverMolbot
} from '../api';
import { x402Fetch } from '../x402Client';

// Mock x402Fetch
vi.mock('../x402Client', () => ({
    x402Fetch: vi.fn(),
    X402_PAYMENT_INFO: { enabled: true }
}));

describe('api.ts utilities', () => {
    const mockFile = new File(['test'], 'test.pdf', { type: 'application/pdf' });

    beforeEach(() => {
        vi.clearAllMocks();
        global.fetch = vi.fn();
    });

    describe('uploadRecord', () => {
        it('should upload a record successfully', async () => {
            const mockResponse = { success: true, ipfs_hash: 'Qm123', message: 'Uploaded' };
            (global.fetch as any).mockResolvedValue({
                ok: true,
                json: async () => mockResponse,
            });

            const result = await uploadRecord(mockFile, 'test-type');
            expect(result).toEqual(mockResponse);
        });

        it('should throw error on upload failure with detail', async () => {
            (global.fetch as any).mockResolvedValue({
                ok: false,
                json: async () => ({ detail: 'Invalid file' }),
            });
            await expect(uploadRecord(mockFile)).rejects.toThrow('Invalid file');
        });

        it('should throw error on upload failure without json detail', async () => {
            (global.fetch as any).mockResolvedValue({
                ok: false,
                statusText: 'Server Error',
                json: async () => ({}) // Empty json
            });
            // Line 76: err.detail is undefined, falls back to 'Upload failed'
            await expect(uploadRecord(mockFile)).rejects.toThrow('Upload failed');
        });
    });

    describe('analyzeDocument', () => {
        it('should analyze a document successfully', async () => {
            const mockResponse = { success: true, analysis: 'Healthy' };
            (x402Fetch as any).mockResolvedValue({
                ok: true,
                json: async () => mockResponse,
            });

            const result = await analyzeDocument(mockFile);
            expect(result).toEqual(mockResponse);
        });

        it('should throw error on analysis failure without detail', async () => {
            (x402Fetch as any).mockResolvedValue({
                ok: false,
                statusText: 'Document Fail',
                json: async () => ({})
            });
            await expect(analyzeDocument(mockFile)).rejects.toThrow('Document analysis failed');
        });
    });

    describe('analyzeSymptoms', () => {
        it('should analyze symptoms successfully', async () => {
            const mockResponse = { success: true, analysis: 'Checkup needed' };
            (x402Fetch as any).mockResolvedValue({
                ok: true,
                json: async () => mockResponse,
            });

            const result = await analyzeSymptoms('cough');
            expect(result).toEqual(mockResponse);
        });

        it('should throw error on symptom analysis failure without detail', async () => {
            (x402Fetch as any).mockResolvedValue({
                ok: false,
                statusText: 'Symptom Fail',
                json: async () => ({})
            });
            await expect(analyzeSymptoms('cough')).rejects.toThrow('Symptom analysis failed');
        });
    });

    describe('orchestrateAnalysis', () => {
        it('should orchestrate analysis successfully', async () => {
            const mockResponse = { success: true, paymentTrail: [] };
            (global.fetch as any).mockResolvedValue({
                ok: true,
                json: async () => mockResponse,
            });

            const result = await orchestrateAnalysis('fever');
            expect(result).toEqual(mockResponse);
        });

        it('should throw error on orchestration failure without detail', async () => {
            (global.fetch as any).mockResolvedValue({
                ok: false,
                statusText: 'Orch Fail',
                json: async () => ({})
            });
            await expect(orchestrateAnalysis('fever')).rejects.toThrow('Orchestration failed');
        });
    });

    describe('listMolbots', () => {
        it('should list molbots successfully', async () => {
            const mockResponse = { agents: [], count: 0, network: 'testnet' };
            (global.fetch as any).mockResolvedValue({
                ok: true,
                json: async () => mockResponse,
            });

            const result = await listMolbots();
            expect(result).toEqual(mockResponse);
        });

        it('should throw error on listing failure', async () => {
            (global.fetch as any).mockResolvedValue({
                ok: false,
            });
            await expect(listMolbots()).rejects.toThrow('Failed to fetch molbot registry');
        });
    });

    describe('discoverMolbot', () => {
        it('should discover a molbot successfully', async () => {
            const mockResponse = { agents: [] };
            (global.fetch as any).mockResolvedValue({
                ok: true,
                json: async () => mockResponse,
            });

            const result = await discoverMolbot('medical-ai');
            expect(result).toEqual(mockResponse);
        });

        it('should throw error on discovery failure', async () => {
            (global.fetch as any).mockResolvedValue({
                ok: false,
            });
            await expect(discoverMolbot('medical-ai')).rejects.toThrow('No molbot found for service type: medical-ai');
        });
    });
});
