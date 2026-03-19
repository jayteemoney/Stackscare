import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    connectWallet,
    disconnectWallet,
    isWalletConnected,
    getStacksAddress,
    fetchPatientRecordIds,
    fetchRecord,
    fetchTotalRecords,
    fetchTxStatus,
    explorerTxUrl,
    explorerAddressUrl,
    callCreateRecord,
    callGrantAccess,
    callRevokeAccess,
    checkIsAuthorized,
    verifyRecord
} from '../stacks';

// Mock @stacks/connect v8
vi.mock('@stacks/connect', () => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnected: vi.fn(),
    getLocalStorage: vi.fn(),
    openContractCall: vi.fn(),
}));

// Mock @stacks/transactions
vi.mock('@stacks/transactions', () => ({
    uintCV: vi.fn(),
    stringAsciiCV: vi.fn(),
    principalCV: vi.fn(),
    fetchCallReadOnlyFunction: vi.fn(),
    cvToJSON: vi.fn(),
}));

describe('stacks.ts utilities (v8 API)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        global.fetch = vi.fn();
    });

    describe('Auth basics', () => {
        it('connectWallet should call connect', async () => {
            const { connect } = await import('@stacks/connect');
            (connect as any).mockResolvedValue({});
            const cb = vi.fn();
            connectWallet(cb);
            await new Promise(process.nextTick);
            expect(connect).toHaveBeenCalled();
            expect(cb).toHaveBeenCalled();
        });

        it('disconnectWallet should call disconnect', async () => {
            const { disconnect } = await import('@stacks/connect');
            disconnectWallet();
            expect(disconnect).toHaveBeenCalled();
        });

        it('isWalletConnected should call isConnected', async () => {
            const { isConnected } = await import('@stacks/connect');
            (isConnected as any).mockReturnValue(true);
            expect(isWalletConnected()).toBe(true);
        });
    });

    describe('getStacksAddress', () => {
        it('should return null if not connected', async () => {
            const { isConnected } = await import('@stacks/connect');
            (isConnected as any).mockReturnValue(false);
            expect(getStacksAddress()).toBeNull();
        });

        it('should return address from localStorage', async () => {
            const { isConnected, getLocalStorage } = await import('@stacks/connect');
            (isConnected as any).mockReturnValue(true);
            (getLocalStorage as any).mockReturnValue({
                addresses: {
                    stx: [
                        { address: 'ST123' },
                        { address: 'SP123' }
                    ]
                }
            });
            expect(getStacksAddress()).toBe('ST123');
        });
    });

    describe('Contract Write Calls', () => {
        it('callCreateRecord should call openContractCall', async () => {
            const { openContractCall } = await import('@stacks/connect');
            const onFinish = vi.fn();
            const onCancel = vi.fn();
            callCreateRecord('Qm123', 'medical', onFinish, onCancel);

            expect(openContractCall).toHaveBeenCalledWith(expect.objectContaining({
                functionName: 'create-record',
            }));

            // Trigger callbacks
            const args = (openContractCall as any).mock.calls[0][0];
            args.onFinish({ txId: 'TX1' });
            expect(onFinish).toHaveBeenCalledWith('TX1');
            args.onCancel();
            expect(onCancel).toHaveBeenCalled();
        });

        it('callGrantAccess should call openContractCall', async () => {
            const { openContractCall } = await import('@stacks/connect');
            callGrantAccess(1, 'ST2', vi.fn(), vi.fn());
            expect(openContractCall).toHaveBeenCalledWith(expect.objectContaining({
                functionName: 'grant-access',
            }));
        });

        it('callRevokeAccess should call openContractCall', async () => {
            const { openContractCall } = await import('@stacks/connect');
            callRevokeAccess(1, 'ST2', vi.fn(), vi.fn());
            expect(openContractCall).toHaveBeenCalledWith(expect.objectContaining({
                functionName: 'revoke-access',
            }));
        });
    });

    describe('Read-only calls', () => {
        it('fetchPatientRecordIds should return numbers', async () => {
            const { fetchCallReadOnlyFunction, cvToJSON } = await import('@stacks/transactions');
            (cvToJSON as any).mockReturnValue({ value: [{ value: '1' }, { value: '2' }] });

            const ids = await fetchPatientRecordIds('ST123');
            expect(ids).toEqual([1, 2]);
            expect(fetchCallReadOnlyFunction).toHaveBeenCalled();
        });

        it('fetchRecord should return structured data', async () => {
            const { cvToJSON } = await import('@stacks/transactions');
            (cvToJSON as any).mockReturnValue({
                success: true,
                value: {
                    value: {
                        owner: { value: 'ST1' },
                        'ipfs-hash': { value: 'Qm' },
                        'record-type': { value: 'test' },
                        timestamp: { value: '123' }
                    }
                }
            });

            const rec = await fetchRecord(1, 'ST123');
            expect(rec).toEqual({
                owner: 'ST1',
                ipfsHash: 'Qm',
                recordType: 'test',
                timestamp: 123
            });
        });

        it('checkIsAuthorized should return boolean', async () => {
            const { cvToJSON } = await import('@stacks/transactions');
            (cvToJSON as any).mockReturnValue({ value: true });
            expect(await checkIsAuthorized(1, 'ST2', 'ST1')).toBe(true);
        });

        it('verifyRecord should return structured data', async () => {
            const { cvToJSON } = await import('@stacks/transactions');
            (cvToJSON as any).mockReturnValue({
                success: true,
                value: {
                    value: {
                        owner: { value: 'ST1' },
                        'record-type': { value: 'test' },
                        timestamp: { value: '123' }
                    }
                }
            });
            const rec = await verifyRecord(1, 'ST1');
            expect(rec).toEqual({ owner: 'ST1', recordType: 'test', timestamp: 123 });
        });

        it('verifyRecord should return null on failure', async () => {
            const { cvToJSON } = await import('@stacks/transactions');
            (cvToJSON as any).mockReturnValue({ success: false });
            expect(await verifyRecord(1, 'ST1')).toBeNull();
        });
    });

    describe('fetchTxStatus', () => {
        it('should return status from API', async () => {
            (global.fetch as any).mockResolvedValue({
                ok: true,
                json: async () => ({ tx_status: 'success' })
            });
            expect(await fetchTxStatus('TX1')).toBe('success');
        });
    });

    describe('URLs', () => {
        it('explorerTxUrl should return hiro explorer url', () => {
            expect(explorerTxUrl('TX1')).toContain('explorer.hiro.so/txid/TX1');
        });

        it('explorerAddressUrl should return hiro explorer url', () => {
            expect(explorerAddressUrl('ST1')).toContain('explorer.hiro.so/address/ST1');
        });
    });
});
