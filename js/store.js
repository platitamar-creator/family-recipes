// זיכרון מקומי במכשיר: לאילו בתים הצטרפתי, הסימונים ברשימת הקניות והשם של אורח.
// מפתח המכשיר של בן הבית נשמר רק כאן, ובזכותו הכניסה אוטומטית.

const HOUSES = 'frb.houses';

function read(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* מצב גלישה פרטית: ממשיכים בלי לשמור */
  }
}

// { [houseId]: { key, member: {id,name,color}, name, emoji, joinedAt } }
export const getHouses = () => read(HOUSES, {});
export const getHouse = (id) => getHouses()[id] || null;

export function saveHouse(id, data) {
  const all = getHouses();
  all[id] = { ...(all[id] || {}), ...data };
  write(HOUSES, all);
}

export function removeHouse(id) {
  const all = getHouses();
  delete all[id];
  write(HOUSES, all);
}

// סימוני "יש בבית" לכל מתכון
export const getChecks = (recipeId) => read(`frb.checks.${recipeId}`, {});
export const setChecks = (recipeId, checks) => write(`frb.checks.${recipeId}`, checks);

export const getGuestName = () => read('frb.guestName', '');
export const setGuestName = (name) => write('frb.guestName', name);
