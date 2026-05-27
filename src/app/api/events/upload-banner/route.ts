import { NextResponse } from 'next/server';
import { isSupabaseConfigured, getSupabase, getSupabaseConfigError, isUsingServiceRole, STORAGE_BUCKET_EVENT_BANNERS } from '@/lib/supabase';
import { findEventByIdCaseInsensitive, serverOrganizerMatchesEvent } from '@/lib/organizer-access';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB (matches schema bucket limit)
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export async function POST(request: Request) {
    if (!isSupabaseConfigured) {
        const msg = getSupabaseConfigError() ?? 'Supabase not configured.';
        return NextResponse.json(
            {
                error: `Banner upload not configured. ${msg} Add NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY to your environment, then redeploy. See supabase/STORAGE.md.`,
            },
            { status: 503 }
        );
    }
    if (!isUsingServiceRole) {
        return NextResponse.json(
            {
                error: 'Banner upload requires an elevated key. Use either: (1) Legacy API Keys tab → service_role (JWT starting with eyJ...), or (2) Create new API Keys → copy the Secret key (sb_secret_...). Set it as SUPABASE_SERVICE_ROLE_KEY in .env.local. Do NOT use the Publishable key (sb_publishable_...).',
            },
            { status: 503 }
        );
    }
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const eventIdRaw = typeof formData.get('eventId') === 'string' ? (formData.get('eventId') as string).trim() : '';
        const organizerWallet = typeof formData.get('organizerWallet') === 'string' ? (formData.get('organizerWallet') as string).trim() : '';
        const organizerEmail = typeof formData.get('organizerEmail') === 'string' ? (formData.get('organizerEmail') as string).trim() : '';

        if (eventIdRaw) {
            if (!organizerWallet && !organizerEmail) {
                return NextResponse.json(
                    { error: 'When updating a banner for an existing event, pass organizerWallet or organizerEmail alongside eventId.' },
                    { status: 403 }
                );
            }
            const ev = await findEventByIdCaseInsensitive(eventIdRaw);
            if (!ev) {
                return NextResponse.json({ error: 'Event not found' }, { status: 404 });
            }
            if (
                !serverOrganizerMatchesEvent(ev.organizer, {
                    organizerWallet,
                    organizerEmail,
                })
            ) {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
            }
        }

        if (!file || !file.size) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 400 });
        }
        if (!ALLOWED_TYPES.includes(file.type)) {
            return NextResponse.json({ error: 'Invalid file type. Use JPEG, PNG, WebP or GIF.' }, { status: 400 });
        }
        const supabase = getSupabase();
        const ext = file.name.split('.').pop() || 'jpg';
        const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        // Use ArrayBuffer to avoid signature/encoding issues with File in Next.js server
        const bytes = await file.arrayBuffer();
        const { data, error } = await supabase.storage
            .from(STORAGE_BUCKET_EVENT_BANNERS)
            .upload(path, bytes, { contentType: file.type, upsert: false });
        if (error) {
            console.error('Supabase storage upload error:', error);
            const isSignatureError = String(error.message || '').toLowerCase().includes('signature');
            const hint = isSignatureError
                ? ' Check that SUPABASE_SERVICE_ROLE_KEY (not anon key) is set correctly in .env.local and matches your Supabase project. Also ensure your project is not paused.'
                : '';
            return NextResponse.json(
                { error: error.message + hint },
                { status: 500 }
            );
        }
        const { data: urlData } = supabase.storage.from(STORAGE_BUCKET_EVENT_BANNERS).getPublicUrl(data.path);
        return NextResponse.json({ url: urlData.publicUrl });
    } catch (error) {
        console.error('Upload banner error:', error);
        return NextResponse.json({ error: 'Failed to upload banner' }, { status: 500 });
    }
}
