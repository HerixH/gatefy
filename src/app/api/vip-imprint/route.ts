import { NextResponse } from 'next/server';
import { generateCode } from '@/lib/codes';

// USDC on Base
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const TREASURY = process.env.TREASURY_WALLET ?? '';
const DEV_MODE = process.env.NEXT_PUBLIC_DEV_MODE === 'true';

export async function POST(request: Request) {
    try {
        const { wallet, txHash } = await request.json();

        if (!wallet || !txHash) {
            return NextResponse.json({ error: 'wallet and txHash are required' }, { status: 400 });
        }

        // In dev mode, skip on-chain verification entirely
        if (DEV_MODE) {
            console.log('[DEV MODE] Skipping payment verification for VIP imprint');
            const code = await generateCode({ vip: true, txHash: 'DEV-' + Date.now(), purchasedBy: wallet });
            return NextResponse.json({ success: true, code }, { status: 201 });
        }

        // Verify the transaction on Base via public RPC
        try {
            const rpcRes = await fetch('https://mainnet.base.org', {
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
                return NextResponse.json({ error: 'Transaction not confirmed' }, { status: 400 });
            }

            // Verify the tx is an ERC-20 transfer to treasury
            // transfer(address,uint256) topic: keccak256("Transfer(address,address,uint256)")
            const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
            const log = receipt.logs?.find((l: { address: string; topics: string[] }) =>
                l.address.toLowerCase() === USDC_ADDRESS.toLowerCase() &&
                l.topics?.[0] === TRANSFER_TOPIC &&
                TREASURY && l.topics?.[2]?.toLowerCase().includes(TREASURY.slice(2).toLowerCase())
            );

            if (TREASURY && !log) {
                return NextResponse.json({ error: 'Payment not verified — wrong recipient or token' }, { status: 400 });
            }
        } catch {
            // If RPC check fails, proceed optimistically in dev (no TREASURY set)
            if (TREASURY) {
                return NextResponse.json({ error: 'Could not verify transaction' }, { status: 500 });
            }
        }

        const code = await generateCode({ vip: true, txHash, purchasedBy: wallet });
        return NextResponse.json({ success: true, code }, { status: 201 });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to generate VIP imprint' }, { status: 500 });
    }
}
