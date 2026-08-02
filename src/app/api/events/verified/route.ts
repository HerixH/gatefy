import { NextResponse } from 'next/server';
import { getAttendance } from '@/lib/codes';

export const dynamic = 'force-dynamic';

function explorerTxUrl(txHash: string): string {
    const net = (process.env.NEXT_PUBLIC_STELLAR_NETWORK || 'testnet').toLowerCase();
    const path = net === 'public' || net === 'mainnet' ? 'public' : 'testnet';
    return `https://stellar.expert/explorer/${path}/tx/${txHash}`;
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const eventId = searchParams.get('eventId');
        const wallet = searchParams.get('wallet');
        const email = searchParams.get('email');

        if (!eventId || (!wallet && !email)) {
            return NextResponse.json({ error: 'eventId and wallet or email are required' }, { status: 400 });
        }

        const records = await getAttendance();
        const id = eventId.trim().toLowerCase();

        const row = records.find((r) => {
            if (r.eventId == null || String(r.eventId).toLowerCase() !== id) return false;
            if (email) {
                return (r.email ?? '').toLowerCase() === email.trim().toLowerCase();
            }
            return r.wallet != null && r.wallet.toLowerCase() === wallet!.trim().toLowerCase();
        });

        const verified = !!row;
        const minted = verified && (row?.mintStatus ?? '').toLowerCase() === 'minted' && !!row?.mintTxHash;
        const mint =
            verified && row
                ? {
                      status: row.mintStatus ?? null,
                      chain: row.mintChain ?? null,
                      txHash: row.mintTxHash ?? null,
                      tokenId: row.mintTokenId ?? null,
                      error: row.mintError ?? null,
                      mintedAt: row.mintedAt ?? null,
                      explorerUrl: row.mintTxHash ? explorerTxUrl(row.mintTxHash) : null,
                      minted,
                  }
                : null;

        return NextResponse.json(
            { verified, minted, mint },
            {
                headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
            }
        );
    } catch (error) {
        return NextResponse.json({ error: 'Failed to check verification' }, { status: 500 });
    }
}
