'use client';

import dynamic from 'next/dynamic';

const OrganizerDashboard = dynamic(
    () =>
        import('@/components/organizer/OrganizerDashboard').then((m) => m.OrganizerDashboard),
    {
        ssr: false,
        loading: () => (
            <div className="min-h-screen bg-black text-white flex items-center justify-center">
                <p className="text-[10px] uppercase tracking-widest text-white/40">
                    Loading host dashboard…
                </p>
            </div>
        ),
    }
);

export function OrganizerDashboardClient() {
    return <OrganizerDashboard />;
}
