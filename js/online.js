// Online scoreboard: sends scores to a small Supabase table and reads the
// best per player and mode back. Scores wait in an outbox (saved on the phone)
// until they're sent, so playing offline loses nothing.
import { ONLINE } from './config.js?v=22';

export const online = () => Boolean(ONLINE.url && ONLINE.key);

const OUTBOX = 'blockit.outbox';
const read = () => { try { return JSON.parse(localStorage.getItem(OUTBOX)) || []; } catch { return []; } };
const write = list => { try { localStorage.setItem(OUTBOX, JSON.stringify(list)); } catch { /* full or private */ } };

function headers(extra = {}) {
  // New publishable keys (sb_publishable_...) go in the apikey header only;
  // an old anon key is a JWT and is also sent as the bearer token.
  const auth = ONLINE.key.startsWith('eyJ') ? { Authorization: `Bearer ${ONLINE.key}` } : {};
  return { apikey: ONLINE.key, ...auth, 'Content-Type': 'application/json', ...extra };
}

// Queue a score: { player, mode, score, day? }. Only the highest waiting
// score per player and mode (and day) is kept.
export function queueScore(entry) {
  if (!online() || !entry.score) return;
  const same = e => e.player === entry.player && e.mode === entry.mode && (e.day || null) === (entry.day || null);
  const list = read();
  const old = list.find(same);
  if (old && old.score >= entry.score) return;
  write([...list.filter(e => !same(e)), { ...entry, day: entry.day || null }]);
  scheduleFlush();
}

let timer = null;
function scheduleFlush(ms = 4000) {
  clearTimeout(timer);
  timer = setTimeout(flush, ms);
}

export async function flush() {
  const list = read();
  if (!online() || !list.length) return;
  try {
    const res = await fetch(`${ONLINE.url}/rest/v1/scores`, {
      method: 'POST',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify(list),
    });
    if (!res.ok) throw new Error(res.status);
    // Drop what was sent; keep anything queued meanwhile.
    write(read().filter(e => !list.some(s => s.player === e.player && s.mode === e.mode && s.day === e.day && s.score === e.score)));
  } catch {
    scheduleFlush(30000); // offline or server trouble: try again later
  }
}

// { bests: { mode: { player: best } }, today: { player: score } }
export async function fetchBoard(day) {
  if (!online()) return null;
  await flush();
  const get = async q => {
    const res = await fetch(`${ONLINE.url}/rest/v1/${q}`, { headers: headers() });
    if (!res.ok) throw new Error(res.status);
    return res.json();
  };
  const [best, today] = await Promise.all([
    get('best_scores?select=player,mode,best'),
    get(`scores?select=player,score&mode=eq.daily&day=eq.${day}`),
  ]);
  const bests = {};
  for (const { player, mode, best: b } of best) (bests[mode] ||= {})[player] = b;
  const todayBest = {};
  for (const { player, score } of today) todayBest[player] = Math.max(todayBest[player] || 0, score);
  return { bests, today: todayBest };
}

// Send whatever is waiting when the app goes to the background.
addEventListener('pagehide', () => { if (read().length) flush(); });
if (online()) scheduleFlush(1500);
