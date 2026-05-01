import { parseUnits } from 'viem';

const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const BASE_RPC = process.env.BASE_MAINNET_RPC ?? 'https://mainnet.base.org';
const DEV_MODE = process.env.NEXT_PUBLIC_DEV_MODE === 'true';

/** Verify a Base mainnet tx is a USDC transfer to treasury of at least minUsdc (human, 6 decimals). */
export async function verifyUsdcTicketPayment(
    txHash: string,
    minUsdc: number,
    treasury: string
): Promise<{ ok: boolean; error?: string }> {
    const tre = treasury?.trim();
    if (!tre || !/^0x[a-fA-F0-9]{40}$/i.test(tre)) {
        return { ok: false, error: 'Treasury wallet not configured' };
    }
    if (DEV_MODE) {
        console.log('[DEV_MODE] Skipping USDC ticket payment verification');
        return { ok: true };
    }
    if (!Number.isFinite(minUsdc) || minUsdc <= 0) {
        return { ok: false, error: 'Invalid ticket price' };
    }

    let minimum: bigint;
    try {
        minimum = parseUnits(minUsdc.toFixed(6), 6);
    } catch {
        return { ok: false, error: 'Invalid amount' };
    }

    const treLower = tre.toLowerCase();
    const treTopicPart = treLower.replace(/^0x/, '').toLowerCase();

    try {
        const rpcRes = await fetch(BASE_RPC, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'eth_getTransactionReceipt',
                params: [txHash],
            }),
        });
        const rpcData = await rpcRes.json();
        const receipt = rpcData?.result;

        if (!receipt || receipt.status !== '0x1') {
            return { ok: false, error: 'Transaction not confirmed' };
        }

        const logs: Array<{ address: string; topics: string[]; data: string }> = receipt.logs ?? [];
        for (const log of logs) {
            if (log.address?.toLowerCase() !== USDC_BASE.toLowerCase()) continue;
            if (log.topics?.[0] !== TRANSFER_TOPIC) continue;
            const toTopic = (log.topics[2] ?? '').toLowerCase();
            if (!toTopic.includes(treTopicPart)) continue;
            const value = BigInt(log.data || '0x0');
            if (value >= minimum) return { ok: true };
        }
        return { ok: false, error: 'No matching USDC transfer to treasury for this amount' };
    } catch (e) {
        console.error('verifyUsdcTicketPayment', e);
        return { ok: false, error: 'Could not verify payment on-chain' };
    }
}
