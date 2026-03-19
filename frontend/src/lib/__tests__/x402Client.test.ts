import { describe, it, expect, vi, beforeEach } from 'vitest';
import { x402Fetch, isHiroWalletAvailable, X402PaymentError, X402WalletError } from '../x402Client';

// Mock @stacks/connect v8
vi.mock('@stacks/connect', () => {
    return {
        isConnected: vi.fn(),
        getLocalStorage: vi.fn(),
        openSTXTransfer: vi.fn(),
    };
});

describe('x402Client.ts (v8 Refactored)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        global.fetch = vi.fn();
        delete (window as any).StacksProvider;
        delete (window as any).HiroWalletProvider;

        if (typeof btoa === 'undefined') {
            global.btoa = (str: string) => Buffer.from(str, 'binary').toString('base64');
        }
    });

    describe('isHiroWalletAvailable', () => {
        it('should return true if provider exists', () => {
            (window as any).StacksProvider = {};
            expect(isHiroWalletAvailable()).toBe(true);
        });
        it('should return false if no provider', () => {
            expect(isHiroWalletAvailable()).toBe(false);
        });
    });

    describe('x402Fetch', () => {
        it('should handle 402 payment flow', async () => {
            const { isConnected, getLocalStorage } = await import('@stacks/connect');

            const firstResponse = {
                status: 402,
                json: async () => ({
                    x402Version: 2,
                    accepts: [{ network: 'stacks-testnet', maxAmountRequired: '100', payTo: 'SP1', tokenType: 'STX' }]
                })
            };
            const secondResponse = { status: 200, ok: true };

            (global.fetch as any)
                .mockResolvedValueOnce(firstResponse)
                .mockResolvedValueOnce(secondResponse);

            // Setup mocks for signStacksPayment
            (window as any).StacksProvider = {};
            (isConnected as any).mockReturnValue(true);
            (getLocalStorage as any).mockReturnValue({
                addresses: { stx: [{ address: 'ST1' }] }
            });

            const res = await x402Fetch('http://api/paid');
            expect(res.status).toBe(200);
            expect(global.fetch).toHaveBeenCalledTimes(2);
        });

        it('should throw error if wallet missing', async () => {
            const firstResponse = {
                status: 402,
                json: async () => ({
                    x402Version: 2,
                    accepts: [{ network: 'stacks-testnet', maxAmountRequired: '100', payTo: 'SP1' }]
                })
            };
            (global.fetch as any).mockResolvedValue(firstResponse);

            await expect(x402Fetch('http://api/paid')).rejects.toThrow(X402WalletError);
        });

        it('should throw error if not connected', async () => {
            const { isConnected } = await import('@stacks/connect');
            (isConnected as any).mockReturnValue(false);
            (window as any).StacksProvider = {};

            const firstResponse = {
                status: 402,
                json: async () => ({
                    x402Version: 2,
                    accepts: [{ network: 'stacks-testnet', maxAmountRequired: '100', payTo: 'SP1' }]
                })
            };
            (global.fetch as any).mockResolvedValue(firstResponse);

            await expect(x402Fetch('http://api/paid')).rejects.toThrow('No Stacks account connected');
        });

        it('should throw error if no address in storage', async () => {
            const { isConnected, getLocalStorage } = await import('@stacks/connect');
            (isConnected as any).mockReturnValue(true);
            (getLocalStorage as any).mockReturnValue({ addresses: { stx: [] } });
            (window as any).StacksProvider = {};

            const firstResponse = {
                status: 402,
                json: async () => ({
                    x402Version: 2,
                    accepts: [{ network: 'stacks-testnet', maxAmountRequired: '100', payTo: 'SP1' }]
                })
            };
            (global.fetch as any).mockResolvedValue(firstResponse);

            await expect(x402Fetch('http://api/paid')).rejects.toThrow('No Stacks address found');
        });
    });
});
