const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data');
const EVENTS_PATH = path.join(DATA_DIR, 'events.json');
const ATTENDANCE_PATH = path.join(DATA_DIR, 'attendance.json');

const events = JSON.parse(fs.readFileSync(EVENTS_PATH, 'utf8'));
const attendance = JSON.parse(fs.readFileSync(ATTENDANCE_PATH, 'utf8'));

let updatedCount = 0;
const updatedAttendance = attendance.map(record => {
    if (!record.eventId) {
        // Try to find an event with this code
        const event = events.find(e => e.verificationCode === record.code);
        if (event) {
            record.eventId = event.id;
            updatedCount++;
        }
    }
    return record;
});

fs.writeFileSync(ATTENDANCE_PATH, JSON.stringify(updatedAttendance, null, 2));
console.log(`Migration complete. Updated ${updatedCount} records.`);
