/** Minimal ABI for GatefyPOAP.mintAttendance on Base. */
export const GATEFY_POAP_ABI = [
    {
        type: 'function',
        name: 'mintAttendance',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'to', type: 'address' },
            { name: 'eventId', type: 'string' },
        ],
        outputs: [{ name: 'tokenId', type: 'uint256' }],
    },
    {
        type: 'function',
        name: 'hasMinted',
        stateMutability: 'view',
        inputs: [
            { name: 'attendee', type: 'address' },
            { name: 'eventId', type: 'string' },
        ],
        outputs: [{ name: '', type: 'bool' }],
    },
    {
        type: 'event',
        name: 'AttendanceMinted',
        inputs: [
            { name: 'to', type: 'address', indexed: true },
            { name: 'tokenId', type: 'uint256', indexed: true },
            { name: 'eventId', type: 'string', indexed: false },
        ],
    },
] as const;
