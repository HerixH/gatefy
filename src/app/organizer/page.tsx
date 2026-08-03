import { OrganizerDashboardClient } from './OrganizerDashboardClient';

export const metadata = {
    title: 'Your events — Gate Protocol',
    description: 'Host workspace: manage your events, tickets, buyers, and check-ins.',
};

export default function OrganizerPage() {
    return <OrganizerDashboardClient />;
}
