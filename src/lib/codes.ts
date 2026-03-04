import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const CODES_PATH = path.join(DATA_DIR, 'codes.json');
const ATTENDANCE_PATH = path.join(DATA_DIR, 'attendance.json');

// Ensure data directory and files exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(CODES_PATH)) fs.writeFileSync(CODES_PATH, JSON.stringify([]));
if (!fs.existsSync(ATTENDANCE_PATH)) fs.writeFileSync(ATTENDANCE_PATH, JSON.stringify([]));

export interface ClaimCode {
    code: string;
    used: boolean;
    createdAt: string;
    usedAt?: string;
    usedBy?: string; // wallet address
    vip?: boolean;
    txHash?: string; // payment tx hash
    purchasedBy?: string; // wallet that paid
}

export interface AttendanceRecord {
    wallet: string;
    code: string;
    checkedInAt: string;
    eventId?: string;
}

// --- Codes ---
export const getCodes = (): ClaimCode[] => {
    return JSON.parse(fs.readFileSync(CODES_PATH, 'utf8'));
};

export const saveCodes = (codes: ClaimCode[]) => {
    fs.writeFileSync(CODES_PATH, JSON.stringify(codes, null, 2));
};

export const generateCode = (opts?: { vip?: boolean; txHash?: string; purchasedBy?: string }): string => {
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    const codes = getCodes();
    codes.push({
        code,
        used: false,
        createdAt: new Date().toISOString(),
        ...(opts?.vip ? { vip: true, txHash: opts.txHash, purchasedBy: opts.purchasedBy } : {}),
    });
    saveCodes(codes);
    return code;
};

export const peekCode = (code: string): ClaimCode | undefined => {
    const codes = getCodes();
    return codes.find(c => c.code === code && !c.used);
};

export const verifyCode = (
    code: string,
    wallet?: string,
    eventId?: string
): { success: boolean; newCheckin: boolean } => {
    const codes = getCodes();
    let newCheckin = false;

    // For event codes, we allow multiple uses
    // For individual VIP codes (not linked to an event), we mark as used
    if (!eventId) {
        const idx = codes.findIndex(c => c.code === code && !c.used);
        if (idx === -1) return { success: false, newCheckin: false };

        codes[idx].used = true;
        codes[idx].usedAt = new Date().toISOString();
        if (wallet) codes[idx].usedBy = wallet;
        saveCodes(codes);
    } else {
        // Just verify the code exists (even if marked used by a VIP purchase, 
        // because an event is linked, we treat it as an active pool)
        const exists = codes.some(c => c.code === code);
        if (!exists) return { success: false, newCheckin: false };

        // Check if this wallet already checked in for this event
        if (wallet) {
            const records = getAttendance();
            const alreadyCheckedIn = records.some(r => r.wallet.toLowerCase() === wallet.toLowerCase() && r.eventId === eventId);
            if (alreadyCheckedIn) {
                // Already recorded, don't double count but still a valid verification
                return { success: true, newCheckin: false };
            }
        }
    }

    // Record attendance
    if (wallet) {
        const records = getAttendance();
        // Avoid duplicates in the log
        const isDuplicate = records.some(r => r.wallet.toLowerCase() === wallet.toLowerCase() && r.code === code && r.eventId === eventId);
        if (!isDuplicate) {
            records.push({ wallet, code, checkedInAt: new Date().toISOString(), eventId });
            fs.writeFileSync(ATTENDANCE_PATH, JSON.stringify(records, null, 2));
            newCheckin = true;
        }
    }

    return { success: true, newCheckin };
};

// --- Attendance ---
export const getAttendance = (): AttendanceRecord[] => {
    return JSON.parse(fs.readFileSync(ATTENDANCE_PATH, 'utf8'));
};
