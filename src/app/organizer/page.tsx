import { OrganizerDashboardClient } from './OrganizerDashboardClient';

export const metadata = {
    title: 'Host dashboard — Gate Protocol',
    description: 'Manage your events, tickets, buyers, and check-ins.',
};

export default function OrganizerPage() {
    return <OrganizerDashboardClient />;
}
