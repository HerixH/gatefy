import { NextResponse } from 'next/server';
import { mintResultToDbFields, peekCode, updateAttendanceMint, verifyCode } from '@/lib/codes';
import { getEventByCode, incrementAttendee } from '@/lib/events';
import { getRegistrationForEvent, isRegistered, isRegisteredByEmail } from '@/lib/registrations';
import { sendAttendanceVerifiedEmail } from '@/lib/email';
import { mintAttendanceProof } from '@/lib/attendance-mint';
import { createPublicClient, http, parseAbi } from 'viem';
import { base } from 'viem/chains';

const publicClient = createPublicClient({
    chain: base,
    transport: http()
});

const MINIMAL_ERC20_ABI = parseAbi([
    'function balanceOf(address account) view returns (uint256)'
]);

export async function POST(request: Request) {
    try {
        const { code: codeRaw, wallet, email: emailRaw, stellarAddress: stellarRaw } = await request.json();
        const code = typeof codeRaw === 'string' ? codeRaw.trim().toUpperCase() : '';
        const email = typeof emailRaw === 'string' ? emailRaw.trim().toLowerCase() : '';
        const stellarAddress =
            typeof stellarRaw === 'string' && /^G[A-Z0-9]{55}$/.test(stellarRaw.trim())
                ? stellarRaw.trim()
                : '';

        if (!code) {
            return NextResponse.json({ error: 'Code is required' }, { status: 400 });
        }

        // 1. Peek at the code to see if it exists and check if it's linked to an event
        const claim = await peekCode(code);
        const event = await getEventByCode(code);

        // If it's not a valid code and not an event code, it's invalid
        if (!claim && !event) {
            return NextResponse.json({ success: false, message: 'Invalid or already used code.' }, { status: 400 });
        }

        // 3. Check for registration (wallet events vs email-only events)
        if (event) {
            const isEmailMode = event.isBlockchain === false;
            if (isEmailMode) {
                if (!email) {
                    return NextResponse.json({
                        success: false,
                        message: 'Enter the email you used to register, or connect a wallet if you registered with one.',
                    }, { status: 400 });
                }
                if (!(await isRegisteredByEmail(event.id, email))) {
                    return NextResponse.json({
                        success: false,
                        message: 'Verification denied: register for this event with this email first.',
                    }, { status: 403 });
                }
            } else {
                const hasWallet = Boolean(wallet && wallet !== '0xDEV');
                const registeredWallet = hasWallet ? await isRegistered(event.id, wallet) : false;
                const registeredEmail = email ? await isRegisteredByEmail(event.id, email) : false;
                if (!registeredWallet && !registeredEmail) {
                    return NextResponse.json({
                        success: false,
                        message: hasWallet
                            ? 'Verification denied: register for this event with this wallet first.'
                            : 'Verification denied: connect the wallet you registered with, or register first.',
                    }, { status: 403 });
                }
            }
        }

        // 4. If it's a VIP event, check token balance
        if (event?.isVip && event.vipTokenAddress) {
            if (!wallet || wallet === '0xDEV') {
                return NextResponse.json({ success: false, message: 'Wallet connection required for VIP verification.' }, { status: 400 });
            }

            try {
                const balance = await publicClient.readContract({
                    address: event.vipTokenAddress as `0x${string}`,
                    abi: MINIMAL_ERC20_ABI,
                    functionName: 'balanceOf',
                    args: [wallet as `0x${string}`],
                });

                const minBalance = BigInt(event.vipMinBalance || '1');

                if (balance < minBalance) {
                    return NextResponse.json({
                        success: false,
                        message: `VIP Access Denied: You need at least ${event.vipMinBalance} tokens. Current balance: ${balance.toString()}`
                    }, { status: 403 });
                }
            } catch (err) {
                console.error('VIP Balance Check Error:', err);
                return NextResponse.json({ success: false, message: 'Failed to verify token ownership. Please check token address.' }, { status: 500 });
            }
        }

        // 5. Mark code used / record attendance — email-only events store email, not wallet
        const emailMode = event?.isBlockchain === false;
        const { success, newCheckin, error: verifyError } = await verifyCode(
            code,
            emailMode ? undefined : wallet && wallet !== '0xDEV' ? wallet : undefined,
            event?.id,
            email || undefined
        );

        if (success) {
            let mint:
                | {
                      ok: boolean;
                      chain?: string;
                      txHash?: string;
                      tokenId?: string;
                      explorerUrl?: string;
                      baseTxHash?: string;
                      baseExplorerUrl?: string;
                      status?: string;
                      error?: string;
                  }
                | undefined;

            if (event && newCheckin) {
                await incrementAttendee(event.id);

                let toEmail = '';
                let attendeeName: string | null = null;
                try {
                    let reg = null as Awaited<ReturnType<typeof getRegistrationForEvent>>;
                    if (emailMode && email) {
                        reg = await getRegistrationForEvent(event.id, { email });
                    } else if (wallet && wallet !== '0xDEV') {
                        reg = await getRegistrationForEvent(event.id, { wallet });
                        if (!reg && email) {
                            reg = await getRegistrationForEvent(event.id, { email });
                        }
                    }
                    toEmail = reg?.email?.trim() || (emailMode && email ? email : '') || '';
                    attendeeName = reg?.name ?? null;
                } catch (e) {
                    console.error('[verify] check-in email lookup error:', e);
                }

                // Mint first so the check-in email can include Stellar Expert / Basescan links.
                try {
                    const mintResult = await mintAttendanceProof({
                        eventId: event.id,
                        stellarAddress: stellarAddress || null,
                        evmWallet: wallet && wallet !== '0xDEV' ? wallet : null,
                    });
                    mint = mintResult.ok
                        ? {
                              ok: true,
                              chain: mintResult.chain,
                              txHash: mintResult.txHash,
                              tokenId: mintResult.tokenId,
                              explorerUrl: mintResult.explorerUrl,
                              baseTxHash: mintResult.also?.txHash,
                              baseExplorerUrl: mintResult.also?.explorerUrl,
                          }
                        : {
                              ok: false,
                              chain: mintResult.chain,
                              status: mintResult.status,
                              error: mintResult.error,
                          };

                    const fields = mintResultToDbFields(mintResult);
                    await updateAttendanceMint({
                        eventId: event.id,
                        wallet: emailMode ? null : wallet && wallet !== '0xDEV' ? wallet : null,
                        email: emailMode ? email : null,
                        ...fields,
                    });
                } catch (e) {
                    console.error('[verify] attendance mint error:', e);
                    mint = {
                        ok: false,
                        chain: 'both',
                        status: 'failed',
                        error: e instanceof Error ? e.message : 'Mint failed',
                    };
                }

                if (toEmail) {
                    void sendAttendanceVerifiedEmail({
                        to: toEmail,
                        event,
                        attendeeName,
                        ...(mint?.ok
                            ? {
                                  chain: mint.chain,
                                  txHash: mint.txHash,
                                  tokenId: mint.tokenId,
                                  explorerUrl: mint.explorerUrl,
                                  baseTxHash: mint.baseTxHash,
                                  baseExplorerUrl: mint.baseExplorerUrl,
                              }
                            : {}),
                    }).catch((e) => console.error('[verify] check-in email failed:', e));
                }
            }

            // If the user already checked in for this event, surface that explicitly
            if (event && !newCheckin) {
                return NextResponse.json({
                    success: true,
                    alreadyVerified: true,
                    message: 'You have already verified attendance for this event.',
                });
            }

            return NextResponse.json({
                success: true,
                alreadyVerified: false,
                message: mint?.ok
                    ? `Attendance verified and minted on ${
                          mint.chain === 'base'
                              ? 'Base'
                              : mint.chain === 'both'
                                ? 'Stellar and Base'
                                : 'Stellar (Soroban)'
                      }.`
                    : 'Attendance recorded.',
                mint,
            });
        }

        return NextResponse.json(
            { success: false, message: verifyError || 'Verification failed.' },
            { status: 400 }
        );
    } catch (error) {
        console.error('Verification Route Error:', error);
        return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
    }
}
