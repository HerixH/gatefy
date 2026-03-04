import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const REGISTRATIONS_PATH = path.join(DATA_DIR, 'registrations.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(REGISTRATIONS_PATH)) fs.writeFileSync(REGISTRATIONS_PATH, JSON.stringify([]));

export interface Registration {
    eventId: string;
    wallet: string;
    registeredAt: string;
}

export const getRegistrations = (): Registration[] => {
    return JSON.parse(fs.readFileSync(REGISTRATIONS_PATH, 'utf8'));
};

const saveRegistrations = (registrations: Registration[]) => {
    fs.writeFileSync(REGISTRATIONS_PATH, JSON.stringify(registrations, null, 2));
};

export const registerForEvent = (eventId: string, wallet: string): boolean => {
    const registrations = getRegistrations();
    const cleanEventId = eventId.trim().toLowerCase();
    const cleanWallet = wallet.trim().toLowerCase();

    const exists = registrations.find(r =>
        r.eventId.toLowerCase() === cleanEventId &&
        r.wallet.toLowerCase() === cleanWallet
    );

    if (exists) return false;

    registrations.push({
        eventId: cleanEventId,
        wallet: cleanWallet,
        registeredAt: new Date().toISOString()
    });

    saveRegistrations(registrations);
    return true;
};

export const isRegistered = (eventId: string, wallet: string): boolean => {
    const registrations = getRegistrations();
    const cleanEventId = eventId.trim().toLowerCase();
    const cleanWallet = wallet.trim().toLowerCase();

    return registrations.some(r =>
        r.eventId.toLowerCase() === cleanEventId &&
        r.wallet.toLowerCase() === cleanWallet
    );
};
