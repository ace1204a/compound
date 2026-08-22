// ============================================================
// Coach — the server side of Compound's in-app AI coach.
//
// Why this exists at all: the Anthropic API key must NEVER sit in
// js/, because everything in js/ is downloaded by the browser and
// this repo is public. The key lives only in Deno.env, here.
//
// Responsibilities, in order:
//   1. only signed-in users get through
//   2. a hard spend cap, checked BEFORE the call and recorded after
//   3. the coach's voice + guardrails (personal facts arrive from
//      the client, so nothing about the user is committed to git)
//
// No dependencies on purpose — plain fetch against Supabase's REST
// and auth endpoints, same no-build-step spirit as the front end.
// ============================================================

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });

// ---------- spend cap ----------
// Prices in USD per million tokens. Update if Anthropic's pricing moves.
const MODELS: Record<string, { id: string; in: number; out: number; label: string }> = {
  standard: { id: 'claude-sonnet-5', in: 3, out: 15, label: 'Sonnet 5' },
  deep: { id: 'claude-opus-5', in: 15, out: 75, label: 'Opus 5' },
};
const CAP_CALLS_PER_DAY = Number(Deno.env.get('COACH_CAP_CALLS_PER_DAY') ?? 25);
const CAP_USD_PER_DAY = Number(Deno.env.get('COACH_CAP_USD_PER_DAY') ?? 1.0);
const CAP_USD_PER_MONTH = Number(Deno.env.get('COACH_CAP_USD_PER_MONTH') ?? 12.0);

const SUPA_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function rest(path: string, init: RequestInit = {}) {
  return fetch(`${SUPA_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, 'content-type': 'application/json', ...(init.headers || {}) },
  });
}

/** Verify the caller's token with Supabase itself — no JWT parsing, no trust assumptions. */
async function userFromToken(token: string): Promise<{ id: string } | null> {
  const r = await fetch(`${SUPA_URL}/auth/v1/user`, { headers: { apikey: SERVICE, authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const u = await r.json().catch(() => null);
  return u && u.id ? { id: u.id } : null;
}

/** Spend so far today and this calendar month, in USD.
 *  Throws rather than returning zeros: a spend cap that can't read the meter
 *  must FAIL CLOSED, or forgetting to run coach-usage.sql silently uncaps it. */
async function usage(userId: string, day: string) {
  const month = day.slice(0, 7);
  const r = await rest(`coach_usage?user_id=eq.${userId}&day=gte.${month}-01&select=day,calls,usd`);
  if (!r.ok) throw new Error('usage-unavailable');
  const rows: { day: string; calls: number; usd: number }[] = await r.json().catch(() => { throw new Error('usage-unavailable'); });
  const today = rows.find((x) => x.day === day);
  return {
    callsToday: today ? Number(today.calls || 0) : 0,
    usdToday: today ? Number(today.usd || 0) : 0,
    usdMonth: rows.reduce((n, x) => n + Number(x.usd || 0), 0),
  };
}

function record(userId: string, day: string, usd: number, inTok: number, outTok: number) {
  return rest('rpc/coach_usage_add', {
    method: 'POST',
    body: JSON.stringify({ p_user: userId, p_day: day, p_usd: usd, p_in: inTok, p_out: outTok }),
  });
}

// ---------- the coach's voice ----------
// Deliberately contains NO personal facts. Who the user is arrives at
// request time in `profile`, which lives in their private synced data.
const PERSONA = `You are the user's coach inside Compound, their personal life-tracking app. You are not a generic chatbot and not a wellness app. You are the same coach they talk to outside the app: someone who knows their numbers, remembers their patterns, and tells them the truth.

VOICE
- Be direct. Lead with the answer or the verdict, not a preamble.
- Do not coddle, do not open with praise you do not mean, do not pad with encouragement. Warmth is fine; flattery is not.
- Challenge them with reasoning, not slogans. If you claim they are avoiding something, show the evidence for it.
- When they are right and you are wrong, concede plainly and immediately, then move on. Never move the goalposts to stay right.
- Short by default — a few sentences. Expand only when they ask for depth or the topic genuinely needs it.
- British English. Their money is in GBP.

METHOD
- Their app data is evidence; their mood is not. Prefer what the log says over what they feel.
- Name the pattern, not just the incident. One bad day is data; the same bad day three times is a mechanism.
- End with ONE concrete next action, small enough to do today. Never hand back a list of five things.
- If several things are wrong, say which one matters most and why the others can wait.
- Ask at most one question per reply, and only when the answer would change your advice.

HONESTY ABOUT WHAT YOU CAN SEE
- You only see what is in the app. If a section is empty, say you are blind there and ask them to log it. Never assume an empty log means they did nothing — they have been wrongly accused by this before and it damaged their trust.
- Never invent numbers, dates, streaks or history. If you do not have it, say so.

HARD RULES
- You are NOT a licensed financial adviser. Never give specific investment or trading advice: no entries, exits, targets, position sizes, instruments or market predictions. You coach the BEHAVIOUR around trading only — rule adherence, session discipline, the risk limits they set for themselves, and whether their own process was followed. If asked for a trade call, decline in one sentence and turn it back to the process.
- If they describe chasing losses, hiding losses, borrowing money to trade, or trading to escape a feeling, name the pattern plainly and surface UK support: GamCare 0808 8020 133 (free, 24/7). For debt: StepChange 0800 138 1111. If they sound in crisis: Samaritans 116 123.
- No medical diagnosis and no therapy. Coaching sleep, food and training is fine; anything clinical goes to a GP.
- Never claim to have changed anything in the app. You can read their data; you cannot write it. Tell them what to tap.`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const user = token ? await userFromToken(token) : null;
  if (!user) return json({ error: 'Sign in to cloud sync first — the coach needs your account.' }, 401);

  // .trim() matters: a trailing newline pasted into the secret becomes an
  // invalid header value, and fetch() throws before the request is ever sent.
  const apiKey = (Deno.env.get('ANTHROPIC_API_KEY') || '').trim();
  if (!apiKey) return json({ error: 'Coach is not configured yet (missing API key).' }, 503);
  if (!/^[\x20-\x7E]+$/.test(apiKey)) {
    return json({ error: 'The ANTHROPIC_API_KEY secret has a line break or hidden character in it. Delete the secret in Supabase and paste it again using the Copy button.' }, 503);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 4000) : '';
  if (!message) return json({ error: 'Say something first.' }, 400);

  const model = MODELS[body.model === 'deep' ? 'deep' : 'standard'];

  // --- cap check, before we spend anything ---
  const day = new Date().toISOString().slice(0, 10);
  let u: { callsToday: number; usdToday: number; usdMonth: number };
  try { u = await usage(user.id, day); }
  catch { return json({ error: 'Spend cap is not set up — run supabase/coach-usage.sql in the SQL editor. Refusing to spend anything until it exists.' }, 503); }
  if (u.callsToday >= CAP_CALLS_PER_DAY) return json({ error: `Daily limit reached (${CAP_CALLS_PER_DAY} messages). Resets at midnight UTC.`, capped: true }, 429);
  if (u.usdToday >= CAP_USD_PER_DAY) return json({ error: `Daily spend cap reached ($${CAP_USD_PER_DAY}). Resets at midnight UTC.`, capped: true }, 429);
  if (u.usdMonth >= CAP_USD_PER_MONTH) return json({ error: `Monthly spend cap reached ($${CAP_USD_PER_MONTH}). Raise it in Supabase if you want more.`, capped: true }, 429);

  const profile = typeof body.profile === 'string' ? body.profile.slice(0, 12000) : '';
  const context = typeof body.context === 'string' ? body.context.slice(0, 16000) : '';
  const history = (Array.isArray(body.history) ? body.history : [])
    .filter((m: { role?: string; text?: string }) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string')
    .slice(-12)
    .map((m: { role: string; text: string }) => ({ role: m.role, content: m.text.slice(0, 4000) }));

  const system = PERSONA
    + (profile ? `\n\n=== WHO YOU ARE COACHING ===\n${profile}` : '')
    + (context ? `\n\n=== THEIR LIVE APP DATA (${day}) ===\nReal, current, pulled from the app just now. Use it. Anything absent means they have not logged it.\n${context}` : '');

  let upstream: Response;
  try {
    upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: model.id, max_tokens: 1200, system, messages: [...history, { role: 'user', content: message }] }),
    });
  } catch (e) {
    // Never swallow this one — the real message is the only clue to whether it
    // was DNS, a bad header, or the network, and guessing wastes the user's time.
    return json({ error: `Could not reach the AI provider — ${e instanceof Error ? e.message : String(e)}` }, 502);
  }

  const result = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    const detail = result && result.error && result.error.message ? ` (${String(result.error.message).slice(0, 160)})` : '';
    return json({ error: `AI provider rejected the request${detail}` }, 502);
  }

  const part = result && Array.isArray(result.content) ? result.content.find((p: { type?: string }) => p.type === 'text') : null;
  const reply = part && typeof part.text === 'string' ? part.text.trim() : '';
  if (!reply) return json({ error: 'The coach returned an empty reply. Try again.' }, 502);

  const inTok = (result.usage && result.usage.input_tokens) || 0;
  const outTok = (result.usage && result.usage.output_tokens) || 0;
  const usd = (inTok * model.in + outTok * model.out) / 1_000_000;
  await record(user.id, day, usd, inTok, outTok).catch(() => {});

  return json({
    reply,
    model: model.label,
    usage: {
      callsToday: u.callsToday + 1,
      capCalls: CAP_CALLS_PER_DAY,
      usdToday: +(u.usdToday + usd).toFixed(4),
      usdMonth: +(u.usdMonth + usd).toFixed(4),
      capUsdMonth: CAP_USD_PER_MONTH,
    },
  });
});
