import { NextResponse } from 'next/server';
import {
    attendanceMintChain,
    explorerUrlForMint,
    mintAttendanceProof,
    mintWantsBase,
    mintWantsSoroban,
} from '@/lib/attendance-mint';
import { mintResultToDbFields, updateAttendanceMint } from '@/lib/codes';
import { sendAttendanceMintedEmail } from '@/lib/email';
import { findEventByIdCaseInsensitive } from '@/lib/organizer-access';
import { getRegistrationForEvent } from '@/lib/registrations';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * Mint attendance proof for an existing check-in
 * (Freighter for Soroban and/or Base wallet for GatefyPOAP).
 */
export async function POST(request: Request) {
    try {
        if (!isSupabaseConfigured) {
            return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
        }

        const body = await request.json();
        const eventId = typeof body.eventId === 'string' ? body.eventId.trim().toLowerCase() : '';
        const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
        const wallet = typeof body.wallet === 'string' ? body.wallet.trim().toLowerCase() : '';
        const stellarAddress =
            typeof body.stellarAddress === 'string' && /^G[A-Z0-9]{55}$/.test(body.stellarAddress.trim())
                ? body.stellarAddress.trim()
                : '';

        if (!eventId) {
            return NextResponse.json({ error: 'eventId is required' }, { status: 400 });
        }
        if (!email && !wallet) {
            return NextResponse.json({ error: 'email or wallet is required' }, { status: 400 });
        }

        const chain = attendanceMintChain();
        const needsStellar = mintWantsSoroban(chain);
        const needsBase = mintWantsBase(chain);
        if (needsStellar && !needsBase && !stellarAddress) {
            return NextResponse.json(
                { error: 'Connect Freighter and pass stellarAddress (G…)' },
                { status: 400 }
            );
        }
        if (needsBase && !needsStellar && !wallet) {
            return NextResponse.json(
                { error: 'Connect a Base wallet and pass wallet (0x…)' },
                { status: 400 }
            );
        }
        if (needsStellar && needsBase && !stellarAddress && !wallet) {
            return NextResponse.json(
                { error: 'Connect Freighter and/or a Base wallet to mint.' },
                { status: 400 }
            );
        }

        const supabase = getSupabase();
        let q = supabase
            .from('attendance')
            .select('id, email, mint_status, mint_chain, mint_tx_hash, mint_token_id, mint_base_tx_hash, mint_base_token_id')
            .eq('event_id', eventId);
        if (email) q = q.ilike('email', email);
        else q = q.eq('wallet', wallet);

        const { data: row, error } = await q.maybeSingle();
        if (error) {
            console.error('[attendance/mint] lookup:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        if (!row) {
            return NextResponse.json(
                { error: 'No check-in found for this event. Verify attendance first.' },
                { status: 404 }
            );
        }

        if (row.mint_status === 'minted' && (row.mint_tx_hash || row.mint_base_tx_hash)) {
            const primaryHash = row.mint_tx_hash || row.mint_base_tx_hash;
            const explorer = explorerUrlForMint(row.mint_chain, primaryHash);
            return NextResponse.json({
                ok: true,
                alreadyMinted: true,
                chain: row.mint_chain || 'soroban',
                txHash: primaryHash,
                tokenId: row.mint_token_id ?? row.mint_base_token_id ?? undefined,
                explorerUrl: explorer,
                baseTxHash: row.mint_base_tx_hash ?? undefined,
                baseTokenId: row.mint_base_token_id ?? undefined,
                baseExplorerUrl: row.mint_base_tx_hash
                    ? explorerUrlForMint('base', row.mint_base_tx_hash)
                    : undefined,
            });
        }

        const mintResult = await mintAttendanceProof({
            eventId,
            stellarAddress: stellarAddress || null,
            evmWallet: wallet || null,
        });

        const fields = mintResultToDbFields(mintResult);
        await updateAttendanceMint({
            eventId,
            wallet: email ? null : wallet || null,
            email: email || null,
            ...fields,
        });

        if (!mintResult.ok) {
            return NextResponse.json(
                {
                    ok: false,
                    status: mintResult.status,
                    error: mintResult.error,
                    chain: mintResult.chain,
                },
                { status: 400 }
            );
        }

        try {
            let reg = null as Awaited<ReturnType<typeof getRegistrationForEvent>>;
            if (email) reg = await getRegistrationForEvent(eventId, { email });
            else if (wallet) reg = await getRegistrationForEvent(eventId, { wallet });
            const toEmail =
                reg?.email?.trim() ||
                email ||
                (typeof row.email === 'string' ? row.email.trim().toLowerCase() : '') ||
                '';
            const event = await findEventByIdCaseInsensitive(eventId);
            if (toEmail && event) {
                void sendAttendanceMintedEmail({
                    to: toEmail,
                    event,
                    attendeeName: reg?.name ?? null,
                    chain: mintResult.chain,
                    txHash: mintResult.txHash,
                    tokenId: mintResult.tokenId,
                    explorerUrl: mintResult.explorerUrl,
                    baseTxHash: mintResult.also?.txHash ?? (mintResult.chain === 'base' ? mintResult.txHash : null),
                    baseExplorerUrl:
                        mintResult.also?.explorerUrl ??
                        (mintResult.chain === 'base' ? mintResult.explorerUrl : null),
                }).catch((e) => console.error('[attendance/mint] email failed:', e));
            }
        } catch (e) {
            console.error('[attendance/mint] email lookup/send error:', e);
        }

        return NextResponse.json({
            ok: true,
            alreadyMinted: false,
            chain: mintResult.chain,
            txHash: mintResult.txHash,
            tokenId: mintResult.tokenId,
            explorerUrl: mintResult.explorerUrl,
            baseTxHash: mintResult.also?.txHash,
            baseTokenId: mintResult.also?.tokenId,
            baseExplorerUrl: mintResult.also?.explorerUrl,
        });
    } catch (e) {
        console.error('[attendance/mint]', e);
        return NextResponse.json({ error: 'Mint failed' }, { status: 500 });
    }
}
