import { NextResponse } from 'next/server';
import { explorerUrlForMint } from '@/lib/attendance-mint';
import { getAttendance } from '@/lib/codes';

export const dynamic = 'force-dynamic';

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
        const minted =
            verified &&
            (row?.mintStatus ?? '').toLowerCase() === 'minted' &&
            !!(row?.mintTxHash || row?.mintBaseTxHash);
        const primaryHash = row?.mintTxHash || row?.mintBaseTxHash || null;
        const mint =
            verified && row
                ? {
                      status: row.mintStatus ?? null,
                      chain: row.mintChain ?? null,
                      txHash: primaryHash,
                      tokenId: row.mintTokenId ?? row.mintBaseTokenId ?? null,
                      error: row.mintError ?? null,
                      mintedAt: row.mintedAt ?? null,
                      explorerUrl: explorerUrlForMint(row.mintChain, primaryHash),
                      baseTxHash: row.mintBaseTxHash ?? null,
                      baseTokenId: row.mintBaseTokenId ?? null,
                      baseExplorerUrl: row.mintBaseTxHash
                          ? explorerUrlForMint('base', row.mintBaseTxHash)
                          : null,
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
