// WinnerOddsProvider — the interface for the Israeli "Winner" (Toto) odds.
// No verified API/feed source exists. This adapter stays `unavailable` until a source is checked
// against the criteria in spec §4.2. Nothing here scrapes, guesses endpoints or promises coverage.
export const PROVIDER = 'winner'

export const FEASIBILITY_CHECK = Object.freeze({
  performedAt: '2026-09-12',
  result: 'unavailable',
  criteria: [
    { id: 'operator-identity', question: 'האם ספק כלשהו מחזיר מפעיל שהוא אכן ווינר הישראלי (ולא שם דומה)?', answer: 'לא אותר. The Odds API ו-API-Football מפרסמים רשימות מפעילים בינלאומיים; ווינר (המועצה להסדר ההימורים בספורט) אינו מופיע בהן כמפעיל מזוהה.', status: 'failed' },
    { id: 'markets-and-rules', question: 'האם הנתונים כוללים שווקים מדויקים, זמן עדכון וכללי הכרעה?', answer: 'לא רלוונטי ללא מקור.', status: 'not_applicable' },
    { id: 'sample-match', question: 'האם היחסים תואמים מדגם מהמקור הרשמי באותו פרק זמן?', answer: 'לא ניתן לבדוק ללא feed.', status: 'not_applicable' },
    { id: 'sustained-collection', question: 'האם יש דרך נתמכת לאיסוף קבוע?', answer: 'לא. אין API ציבורי מתועד; עקיפת חסימות או שימוש בתוצאות חיפוש כ-feed אינם מותרים.', status: 'failed' },
  ],
  consequence: 'הרכבת טופס המסומן כטופס ווינר חסומה. משחקים והיסטוריה ממשיכים לעבוד. ניתן להפעיל פיילוט market-paper עם מפעיל בינלאומי מזוהה (The Odds API) רק לאחר בחירה מפורשת בהגדרות.',
})

export class WinnerOddsProvider {
  constructor({ providerId = process.env.WINNER_PROVIDER || null } = {}) { this.providerId = providerId }
  get name() { return PROVIDER }
  get available() { return false }
  get status() { return { provider: PROVIDER, available: false, configuredAdapter: this.providerId, feasibility: FEASIBILITY_CHECK } }
  async odds() { throw Object.assign(new Error('WinnerOddsProvider unavailable: no verified source'), { code: 'winner_unavailable' }) }
}
