
// Utility for Indian Calendar (Panchang) and Holidays
// Dynamic calculation for infinite year support with IST correction.

export type EventType = 'national' | 'hindu' | 'none';

export interface IndianDateInfo {
    dateStr: string;
    tithi: string;       // e.g. "Shukla 5", "Purnima"
    festival?: string;   // e.g. "Diwali"
    eventTypes: EventType[]; // ['national', 'hindu']
    description?: string;
    events: { name: string, type: EventType, desc: string }[];
}

// --- Astronomical Constants ---
// Reference New Moon: Jan 6, 2000, 12:24 PM UTC (Approx)
const REF_NEW_MOON_2000 = new Date('2000-01-06T12:24:00Z').getTime();
const LUNAR_CYCLE = 29.530588 * 24 * 60 * 60 * 1000; // Synodic Month length

// --- Tithi Calculator ---
function getTithiDetails(date: Date): { tithiName: string, tithiIndex: number, phase: number } {
    // 1. Calculate time difference from reference
    const diff = date.getTime() - REF_NEW_MOON_2000;
    
    // 2. Determine phase (0.0 to 1.0)
    const phase = ((diff % LUNAR_CYCLE) + LUNAR_CYCLE) % LUNAR_CYCLE / LUNAR_CYCLE;
    
    // 3. Convert to Lunar Day (1-30)
    const lunarDayRaw = phase * 30;
    const tithiIndex = Math.floor(lunarDayRaw) + 1; // 1 to 30

    let tithiName = '';
    if (tithiIndex === 30) tithiName = 'Amavasya';
    else if (tithiIndex === 15) tithiName = 'Purnima';
    else if (tithiIndex < 15) tithiName = `Shukla ${tithiIndex}`;
    else tithiName = `Krishna ${tithiIndex - 15}`;

    return { tithiName, tithiIndex, phase };
}

// --- Easter Algorithm (Meeus/Jones/Butcher) ---
function getEasterDate(year: number): { month: number, day: number } {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return { month, day };
}

// --- Festival Rules ---
const inWindow = (m: number, d: number, startM: number, startD: number, endM: number, endD: number) => {
    if (m === startM && d >= startD) return true;
    if (m === endM && d <= endD) return true;
    if (m > startM && m < endM) return true;
    return false;
};

// --- Main Calculator ---
export const getIndianDateInfo = (date: Date): IndianDateInfo => {
    // 1. Extract local YMD from the input date (which is usually local midnight of the cell)
    const offsetMs = date.getTimezoneOffset() * 60000;
    const localDate = new Date(date.getTime() - offsetMs);
    const dateStr = localDate.toISOString().split('T')[0];
    
    const year = localDate.getUTCFullYear();
    const month = localDate.getUTCMonth() + 1; // 1-12
    const day = localDate.getUTCDate();

    // 2. Construct specific IST Query Time: Noon IST on that day.
    // Noon IST = 06:30 UTC.
    // We use UTC date constructor to be precise regardless of local system time.
    const queryDate = new Date(Date.UTC(year, month - 1, day, 6, 30, 0));

    const { tithiName, tithiIndex } = getTithiDetails(queryDate);
    
    const events: { name: string, type: EventType, desc: string }[] = [];

    // --- 1. Fixed Gregorian Holidays ---
    if (month === 1 && day === 1) events.push({ name: 'New Year', type: 'national', desc: 'Start of Gregorian Year' });
    if (month === 1 && day === 26) events.push({ name: 'Republic Day', type: 'national', desc: 'Constitution of India Day' });
    if (month === 4 && day === 14) events.push({ name: 'Ambedkar Jayanti', type: 'national', desc: 'B.R. Ambedkar Birthday' });
    if (month === 8 && day === 15) events.push({ name: 'Independence Day', type: 'national', desc: 'India Independence Day' });
    if (month === 10 && day === 2) events.push({ name: 'Gandhi Jayanti', type: 'national', desc: 'Mahatma Gandhi Birthday' });
    if (month === 12 && day === 25) events.push({ name: 'Christmas', type: 'national', desc: 'Christian Observance' });

    // --- 2. Solar Fixed (Approximate) ---
    if (month === 1 && (day === 13 || day === 14)) events.push({ name: 'Lohri', type: 'hindu', desc: 'Harvest Festival (North)' });
    if (month === 1 && (day === 14 || day === 15)) events.push({ name: 'Makar Sankranti / Pongal', type: 'hindu', desc: 'Harvest Festival / Sun Transition' });
    if (month === 4 && (day === 13 || day === 14)) events.push({ name: 'Vaisakhi', type: 'hindu', desc: 'Sikh New Year / Harvest' }); 

    // --- 3. Easter Based ---
    const easter = getEasterDate(year);
    const gfDate = new Date(year, easter.month - 1, easter.day - 2);
    if (gfDate.getMonth() + 1 === month && gfDate.getDate() === day) {
        events.push({ name: 'Good Friday', type: 'national', desc: 'Christian Observance' });
    }

    // --- 4. Tithi Based (Lunisolar) ---
    
    // Vasant Panchami: Shukla 5 (Index 5) in Jan/Feb
    if (tithiIndex === 5 && inWindow(month, day, 1, 15, 2, 20)) {
        events.push({ name: 'Vasant Panchami', type: 'hindu', desc: 'Worship of Goddess Saraswati' });
    }

    // Maha Shivaratri: Krishna 13/14 (Index 28/29) in Feb/Mar
    if ((tithiIndex === 28 || tithiIndex === 29) && inWindow(month, day, 2, 10, 3, 15)) {
        events.push({ name: 'Maha Shivaratri', type: 'hindu', desc: 'The Great Night of Shiva' });
    }

    // Holika Dahan: Shukla 14/15 (Index 14/15) in Mar
    // Prioritizing Index 15 for Holika Dahan based on 2026 data
    if ((tithiIndex === 14 || tithiIndex === 15) && inWindow(month, day, 2, 20, 3, 25)) {
        events.push({ name: 'Holika Dahan', type: 'hindu', desc: 'Burning of Holika' });
    }

    // Holi: Purnima/Krishna 1 (Index 15/16) in Mar
    // Usually next day of Holika Dahan
    if ((tithiIndex === 15 || tithiIndex === 16) && inWindow(month, day, 2, 25, 3, 30)) {
        const existing = events.find(e => e.name.includes('Holika'));
        if (!existing || tithiIndex === 16) {
             events.push({ name: 'Holi', type: 'hindu', desc: 'Festival of Colors' });
        }
    }

    // Ugadi / Gudi Padwa: Shukla 1 (Index 1) in Mar/Apr
    if (tithiIndex === 1 && inWindow(month, day, 3, 15, 4, 15)) {
        events.push({ name: 'Ugadi / Gudi Padwa', type: 'hindu', desc: 'Hindu New Year' });
    }

    // Rama Navami: Shukla 9 (Index 9) in Mar/Apr
    if (tithiIndex === 9 && inWindow(month, day, 3, 20, 4, 25)) {
        events.push({ name: 'Rama Navami', type: 'hindu', desc: 'Birth of Lord Rama' });
    }

    // Mahavir Jayanti: Shukla 13 (Index 13) in Mar/Apr
    if (tithiIndex === 13 && inWindow(month, day, 3, 25, 4, 25)) {
        events.push({ name: 'Mahavir Jayanti', type: 'hindu', desc: 'Birth of Lord Mahavir' });
    }

    // Akshaya Tritiya: Shukla 3 (Index 3) in Apr/May
    if (tithiIndex === 3 && inWindow(month, day, 4, 15, 5, 15)) {
        events.push({ name: 'Akshaya Tritiya', type: 'hindu', desc: 'Day of Eternal Prosperity' });
    }

    // Buddha Purnima: Purnima (Index 15) in Apr/May/Jun
    if (tithiIndex === 15 && inWindow(month, day, 4, 20, 6, 5)) {
        events.push({ name: 'Buddha Purnima', type: 'hindu', desc: 'Birth of Gautama Buddha' });
    }

    // Rath Yatra: Shukla 2 (Index 2) in Jun/Jul
    if (tithiIndex === 2 && inWindow(month, day, 6, 15, 7, 20)) {
        events.push({ name: 'Rath Yatra', type: 'hindu', desc: 'Chariot Festival' });
    }

    // Guru Purnima: Purnima (Index 15) in Jul
    if (tithiIndex === 15 && inWindow(month, day, 6, 25, 7, 30)) {
        events.push({ name: 'Guru Purnima', type: 'hindu', desc: 'Honoring Teachers' });
    }

    // Raksha Bandhan: Purnima (Index 15) in Aug
    if (tithiIndex === 15 && inWindow(month, day, 8, 1, 8, 31)) {
        events.push({ name: 'Raksha Bandhan', type: 'hindu', desc: 'Bond of Protection' });
    }

    // Janmashtami: Krishna 8 (Index 23) in Aug/Sep
    if (tithiIndex === 23 && inWindow(month, day, 8, 10, 9, 15)) {
        events.push({ name: 'Janmashtami', type: 'hindu', desc: 'Birth of Lord Krishna' });
    }

    // Ganesh Chaturthi: Shukla 4 (Index 4) in Aug/Sep
    if (tithiIndex === 4 && inWindow(month, day, 8, 20, 9, 25)) {
        events.push({ name: 'Ganesh Chaturthi', type: 'hindu', desc: 'Arrival of Ganesha' });
    }

    // Navratri Start: Shukla 1 (Index 1) in Sep/Oct
    if (tithiIndex === 1 && inWindow(month, day, 9, 25, 10, 25)) {
        events.push({ name: 'Navratri Start', type: 'hindu', desc: 'Festival of Nine Nights' });
    }

    // Dussehra: Shukla 10 (Index 10) in Sep/Oct
    if (tithiIndex === 10 && inWindow(month, day, 9, 25, 10, 25)) {
        events.push({ name: 'Dussehra', type: 'hindu', desc: 'Victory of Good over Evil' });
    }

    // Karwa Chauth: Krishna 4 (Index 19) in Oct/Nov
    if (tithiIndex === 19 && inWindow(month, day, 10, 10, 11, 10)) {
        events.push({ name: 'Karwa Chauth', type: 'hindu', desc: 'Fasting for Spouses' });
    }

    // Dhanteras: Krishna 13 (Index 28) in Oct/Nov
    if (tithiIndex === 28 && inWindow(month, day, 10, 15, 11, 15)) {
        events.push({ name: 'Dhanteras', type: 'hindu', desc: 'Worship of Wealth' });
    }

    // Diwali: Amavasya (Index 30) in Oct/Nov
    if (tithiIndex === 30 && inWindow(month, day, 10, 15, 11, 15)) {
        events.push({ name: 'Diwali', type: 'hindu', desc: 'Festival of Lights' });
    }

    // Bhai Dooj: Shukla 2 (Index 2) in Oct/Nov (After Diwali)
    if (tithiIndex === 2 && inWindow(month, day, 10, 20, 11, 20)) {
        events.push({ name: 'Bhai Dooj', type: 'hindu', desc: 'Bond between Siblings' });
    }

    // Chhath Puja: Shukla 6 (Index 6) in Oct/Nov
    if (tithiIndex === 6 && inWindow(month, day, 10, 25, 11, 25)) {
        events.push({ name: 'Chhath Puja', type: 'hindu', desc: 'Sun Worship' });
    }

    // Guru Nanak Jayanti: Purnima (Index 15) in Nov
    if (tithiIndex === 15 && inWindow(month, day, 11, 1, 11, 30)) {
        events.push({ name: 'Guru Nanak Jayanti', type: 'hindu', desc: 'Birth of Guru Nanak' });
    }

    // --- Post-Processing ---
    const types: EventType[] = [];
    let festivalName = undefined;
    let description = undefined;

    if (events.length > 0) {
        if (events.some(e => e.type === 'national')) types.push('national');
        if (events.some(e => e.type === 'hindu')) types.push('hindu');
        
        festivalName = events.map(e => e.name).join(' / ');
        description = events[0].desc;
    }

    return {
        dateStr,
        tithi: tithiName,
        festival: festivalName,
        eventTypes: types,
        description,
        events
    };
};
