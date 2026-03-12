import { NextResponse } from 'next/server';
import { getLeaderboardAttendees, getLeaderboardOrganizers } from '@/lib/leaderboard';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 100);
        const type = searchParams.get('type'); // 'attendees' | 'organizers' | undefined = both

        if (type === 'attendees') {
            const attendees = await getLeaderboardAttendees(limit);
            return NextResponse.json({ attendees }, { headers: { 'Cache-Control': 'no-store, max-age=60' } });
        }
        if (type === 'organizers') {
            const organizers = await getLeaderboardOrganizers(limit);
            return NextResponse.json({ organizers }, { headers: { 'Cache-Control': 'no-store, max-age=60' } });
        }

        const [attendees, organizers] = await Promise.all([
            getLeaderboardAttendees(limit),
            getLeaderboardOrganizers(limit),
        ]);
        return NextResponse.json(
            { attendees, organizers },
            { headers: { 'Cache-Control': 'no-store, max-age=60' } }
        );
    } catch (error) {
        console.error('Leaderboard error:', error);
        return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 });
    }
}
