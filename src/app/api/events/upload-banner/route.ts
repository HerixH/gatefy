import { NextResponse } from 'next/server';
import { isSupabaseConfigured, getSupabase, getSupabaseConfigError, STORAGE_BUCKET_EVENT_BANNERS } from '@/lib/supabase';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB (matches schema bucket limit)
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export async function POST(request: Request) {
    if (!isSupabaseConfigured) {
        const msg = getSupabaseConfigError() ?? 'Supabase not configured.';
        return NextResponse.json(
            {
                error: `Banner upload not configured. ${msg} Add both to .env.local in the project root, then restart the dev server. See supabase/STORAGE.md.`,
            },
            { status: 503 }
        );
    }
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;
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
        const { data, error } = await supabase.storage
            .from(STORAGE_BUCKET_EVENT_BANNERS)
            .upload(path, file, { contentType: file.type, upsert: false });
        if (error) {
            console.error('Supabase storage upload error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        const { data: urlData } = supabase.storage.from(STORAGE_BUCKET_EVENT_BANNERS).getPublicUrl(data.path);
        return NextResponse.json({ url: urlData.publicUrl });
    } catch (error) {
        console.error('Upload banner error:', error);
        return NextResponse.json({ error: 'Failed to upload banner' }, { status: 500 });
    }
}
