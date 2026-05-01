import { NextResponse } from 'next/server';
import { peekCode, verifyCode } from '@/lib/codes';
import { getEventByCode, incrementAttendee } from '@/lib/events';
import { getRegistrationForEvent, isRegistered, isRegisteredByEmail } from '@/lib/registrations';
import { sendAttendanceVerifiedEmail } from '@/lib/email';
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
        const { code, wallet, email: emailRaw } = await request.json();
        const email = typeof emailRaw === 'string' ? emailRaw.trim().toLowerCase() : '';

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
            } else if (wallet && wallet !== '0xDEV') {
                if (!(await isRegistered(event.id, wallet))) {
                    return NextResponse.json({
                        success: false,
                        message: 'Verification Denied: You must register for this event first.',
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
        const { success, newCheckin } = await verifyCode(
            code,
            emailMode ? undefined : wallet,
            event?.id,
            emailMode ? email || undefined : undefined
        );

        if (success) {
            if (event && newCheckin) {
                await incrementAttendee(event.id);

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
                    const toEmail = reg?.email?.trim() || (emailMode && email ? email : '');
                    if (toEmail) {
                        void sendAttendanceVerifiedEmail({
                            to: toEmail,
                            event,
                            attendeeName: reg?.name ?? null,
                        }).catch((e) => console.error('[verify] check-in email failed:', e));
                    }
                } catch (e) {
                    console.error('[verify] check-in email lookup/send error:', e);
                }
            }

            // If the user already checked in for this event, surface that explicitly
            if (event && !newCheckin) {
                return NextResponse.json({
                    success: true,
                    alreadyVerified: true,
                    message: 'You have already verified attendance for this event.'
                });
            }

            return NextResponse.json({
                success: true,
                alreadyVerified: false,
                message: 'Attendance recorded.'
            });
        }

        return NextResponse.json({ success: false, message: 'Verification failed.' }, { status: 400 });
    } catch (error) {
        console.error('Verification Route Error:', error);
        return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
    }
}
