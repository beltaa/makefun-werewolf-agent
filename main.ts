// Local, deterministic Werewolf agent for make.fun's werewolf-agent-01.
// Standard library only; no model calls, clock reads, or unseeded randomness.

type AnyObj = Record<string, any>;
type Player = { seat: number; name?: string; alive: boolean; role?: string | null };
type Claim = { speaker: number; text: string; isSeer: boolean; report: { seat: number; werewolf: boolean } | null };

const isObj = (v: unknown): v is AnyObj => v !== null && typeof v === 'object' && !Array.isArray(v);
const intSeat = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 8;
const playersOf = (view: AnyObj): Player[] => Array.isArray(view?.players) ? view.players.filter((p: any) => isObj(p) && intSeat(p.seat)) : [];
const logOf = (view: AnyObj): AnyObj[] => Array.isArray(view?.log) ? view.log.filter(isObj) : [];
const youSeat = (view: AnyObj): number => intSeat(view?.you?.seat) ? view.you.seat : 1;
const roleOf = (view: AnyObj, seat: number): string | null => {
  if (seat === youSeat(view) && typeof view?.you?.role === 'string') return view.you.role;
  const p = playersOf(view).find(x => x.seat === seat);
  return typeof p?.role === 'string' ? p.role : null;
};
const nameOf = (view: AnyObj, seat: number): string => {
  const p = playersOf(view).find(x => x.seat === seat);
  return typeof p?.name === 'string' ? p.name : `Seat ${seat}`;
};
const alivePlayers = (view: AnyObj): Player[] => playersOf(view).filter(p => p.alive);
const partnerSeat = (view: AnyObj): number | null => intSeat(view?.you?.partner?.seat) ? view.you.partner.seat : null;
const currentDay = (view: AnyObj): number => Number.isInteger(view?.day) && view.day > 0 ? view.day : 1;

/** Exact/private or publicly revealed team information available to this seat. */
export function knownStatus(view: AnyObj, seat: number): boolean | null {
  const role = roleOf(view, seat);
  if (role === 'werewolf') return true;
  if (role === 'seer' || role === 'doctor' || role === 'villager') return false;
  if (view?.you?.role === 'werewolf') {
    if (seat === youSeat(view) || seat === partnerSeat(view)) return true;
  }
  if (view?.you?.role === 'seer' && Array.isArray(view.seerResults)) {
    const r = view.seerResults.find((x: any) => x?.seat === seat);
    if (typeof r?.werewolf === 'boolean') return r.werewolf;
  }
  return null;
}

function parseSeerReport(text: string): { seat: number; werewolf: boolean } | null {
  const lower = text.toLowerCase();
  let seat: number | null = null;
  let index = -1;
  const checked = /\b(?:checked|inspected|scanned|tested|cleared)\s+(?:seat\s*)?([1-8])\b/i.exec(text);
  const explicit = /\bseat\s*([1-8])\b/i.exec(text);
  const m = checked ?? explicit;
  if (m && m.index !== undefined) {
    seat = Number(m[1]);
    index = m.index + m[0].length;
  }
  if (seat === null || index < 0) return null;
  const tail = lower.slice(index, Math.min(lower.length, index + 130));
  const negative = /\b(?:not|isn't|isnt|never|no)\s+(?:a\s+)?(?:werewolf|wolf)\b/.test(tail)
    || /\b(?:innocent|clear|clean|not\s+wolf|not\s+werewolf|village)\b/.test(tail);
  if (negative) return { seat, werewolf: false };
  if (/\b(?:werewolf|wolf)\b/.test(tail)) return { seat, werewolf: true };
  return null;
}

function isSeerClaim(text: string): boolean {
  return /\b(?:i am|i'm|im|as the|as a)\s+(?:a\s+)?seer\b/i.test(text)
    || /\bseer\s+(?:here|speaking|claim)\b/i.test(text)
    || /\bmy\s+(?:seer|night|inspection|check)\b/i.test(text)
    || /\b(?:checked|inspected)\s+(?:seat\s*)?[1-8]\b/i.test(text);
}

export function claimsFrom(view: AnyObj): Claim[] {
  const claims: Claim[] = [];
  for (const e of logOf(view)) {
    if (e.kind !== 'speech' || !intSeat(e.seat) || typeof e.text !== 'string') continue;
    const report = parseSeerReport(e.text);
    const claim = isSeerClaim(e.text);
    if (claim || report) claims.push({ speaker: e.seat, text: e.text, isSeer: claim, report });
  }
  return claims;
}

function liveTargetSet(view: AnyObj): Set<number> {
  return new Set(alivePlayers(view).map(p => p.seat));
}

function accusationMentions(text: string): number[] {
  const out = new Set<number>();
  const patterns = [
    /\b(?:suspect|accuse|vote\s+for|voting\s+for|target|exile|eliminate)\s+(?:seat\s*)?([1-8])\b/ig,
    /\b(?:seat\s*)?([1-8])\b[^.!?]{0,38}\b(?:is|looks|seems|might be|could be|must be|has to be)\s+(?:a\s+)?(?:werewolf|wolf|suspicious|wolfish)\b/ig,
    /\b(?:seat\s*)?([1-8])\b[^.!?]{0,30}\b(?:suspicious|wolfish|lying)\b/ig,
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const n = Number(m[1]);
      if (intSeat(n)) {
        const tail = text.slice((m.index ?? 0), (m.index ?? 0) + 100).toLowerCase();
        if (!/\b(?:not|isn't|isnt|never)\b.{0,25}\b(?:wolf|werewolf|suspicious|lying)\b/.test(tail)) out.add(n);
      }
    }
  }
  return [...out];
}

function currentVotes(view: AnyObj): { counts: Map<number, number>; bySeat: Map<number, number | null> } {
  const counts = new Map<number, number>();
  const bySeat = new Map<number, number | null>();
  const day = currentDay(view);
  for (const e of logOf(view)) {
    if (e.kind !== 'vote' || e.day !== day || !intSeat(e.seat)) continue;
    const target = intSeat(e.target) ? e.target : null;
    bySeat.set(e.seat, target);
    if (target !== null) counts.set(target, (counts.get(target) ?? 0) + 1);
  }
  return { counts, bySeat };
}

/** Role inference from revealed deaths, public seer claims, and prior voting. */
export function suspicionScores(view: AnyObj): Map<number, number> {
  const scores = new Map<number, number>();
  for (const p of alivePlayers(view)) scores.set(p.seat, 0);
  for (const p of alivePlayers(view)) {
    const status = knownStatus(view, p.seat);
    if (status === true) scores.set(p.seat, 1000);
    else if (status === false) scores.set(p.seat, -1000);
  }

  const claims = claimsFrom(view);
  const claimsBySpeaker = new Map<number, Claim[]>();
  for (const c of claims) {
    if (!claimsBySpeaker.has(c.speaker)) claimsBySpeaker.set(c.speaker, []);
    claimsBySpeaker.get(c.speaker)!.push(c);
  }
  const reliability = new Map<number, number>();
  for (const [speaker, ownClaims] of claimsBySpeaker) {
    let good = 0;
    let bad = 0;
    for (const c of ownClaims) {
      if (!c.report) continue;
      const status = knownStatus(view, c.report.seat);
      if (status === null) continue;
      if (status === c.report.werewolf) good++;
      else bad++;
    }
    const trust = Math.max(0.12, Math.min(1.8, 0.75 + good * 0.35 - bad * 0.85));
    reliability.set(speaker, trust);
    if (bad > 0) scores.set(speaker, (scores.get(speaker) ?? 0) + 30 * bad);
    if (good > 0) scores.set(speaker, (scores.get(speaker) ?? 0) - 1.5 * good);
  }

  for (const c of claims) {
    if (!c.report || !liveTargetSet(view).has(c.report.seat)) continue;
    const status = knownStatus(view, c.report.seat);
    const trust = reliability.get(c.speaker) ?? 0.75;
    if (status !== null) continue;
    const delta = c.report.werewolf ? 11 * trust : -3.2 * trust;
    scores.set(c.report.seat, (scores.get(c.report.seat) ?? 0) + delta);
  }

  // A player whose vote helped exile a revealed villager deserves scrutiny; voting for a revealed wolf is mild counterevidence.
  const votesByDay = new Map<number, AnyObj[]>();
  for (const e of logOf(view)) {
    if (e.kind === 'vote' && Number.isInteger(e.day) && intSeat(e.seat)) {
      if (!votesByDay.has(e.day)) votesByDay.set(e.day, []);
      votesByDay.get(e.day)!.push(e);
    }
  }
  for (const [day, votes] of votesByDay) {
    const exile = logOf(view).find(e => e.day === day && e.kind === 'exile' && intSeat(e.seat));
    if (!exile) continue;
    const exiledWolf = exile.role === 'werewolf';
    for (const vote of votes) {
      if (vote.target === exile.seat) {
        const delta = exiledWolf ? -0.65 : 1.15;
        scores.set(vote.seat, (scores.get(vote.seat) ?? 0) + delta);
      }
    }
  }

  // Statements are noisy; use parsed direct accusations as modest evidence, not proof.
  for (const e of logOf(view)) {
    if (e.kind !== 'speech' || !intSeat(e.seat) || typeof e.text !== 'string') continue;
    for (const target of accusationMentions(e.text)) {
      if (target === e.seat || !liveTargetSet(view).has(target)) continue;
      const status = knownStatus(view, target);
      if (status === true) continue;
      const delta = status === false ? -0.5 : 1.1;
      scores.set(target, (scores.get(target) ?? 0) + delta);
    }
  }
  return scores;
}

function stableRank(seat: number, view: AnyObj, game: number): number {
  const offset = (currentDay(view) * 3 + youSeat(view) * 5 + game * 7) % 8;
  return (seat - 1 - offset + 16) % 8;
}

function chooseByScore(view: AnyObj, options: number[], game: number, votesWeight = 0): number | null {
  const valid = options.filter(intSeat);
  if (valid.length === 0) return null;
  const scores = suspicionScores(view);
  const votes = currentVotes(view).counts;
  valid.sort((a, b) => {
    const sa = (scores.get(a) ?? 0) + votesWeight * (votes.get(a) ?? 0);
    const sb = (scores.get(b) ?? 0) + votesWeight * (votes.get(b) ?? 0);
    if (sa !== sb) return sb - sa;
    const va = votes.get(a) ?? 0, vb = votes.get(b) ?? 0;
    if (va !== vb) return vb - va;
    return stableRank(a, view, game) - stableRank(b, view, game);
  });
  return valid[0] ?? null;
}

function seerSpeech(view: AnyObj, round: number): string {
  const results = Array.isArray(view.seerResults) ? view.seerResults.filter((r: any) => Number.isInteger(r?.night) && intSeat(r?.seat) && typeof r?.werewolf === 'boolean') : [];
  if (results.length === 0) return 'I am the seer. I have no result to report yet; please share concrete evidence and avoid splitting the vote.';
  const lines = results.slice(-5).map((r: any) => `night ${r.night} I checked seat ${r.seat}: ${r.werewolf ? 'werewolf' : 'not a werewolf'}`);
  if (round <= 1) return `I am the seer. ${lines.join('; ')}. Please use these checks when we vote.`;
  return `As the seer, I stand by my results: ${lines.join('; ')}. Let's coordinate on any confirmed werewolf rather than split votes.`;
}

function wolfFakeSeerTarget(view: AnyObj, game: number): number | null {
  const options = alivePlayers(view).map(p => p.seat).filter(s => s !== youSeat(view) && s !== partnerSeat(view));
  if (options.length === 0) return null;
  const votes = currentVotes(view).counts;
  const mentions = new Map<number, number>();
  for (const e of logOf(view)) {
    if (e.kind !== 'speech' || !intSeat(e.seat) || e.seat === youSeat(view) || typeof e.text !== 'string') continue;
    for (const s of accusationMentions(e.text)) mentions.set(s, (mentions.get(s) ?? 0) + 1);
  }
  options.sort((a, b) => {
    const pa = (votes.get(a) ?? 0) * 3 + (mentions.get(a) ?? 0);
    const pb = (votes.get(b) ?? 0) * 3 + (mentions.get(b) ?? 0);
    if (pa !== pb) return pb - pa;
    return stableRank(a, view, game) - stableRank(b, view, game);
  });
  return options[0] ?? null;
}

function speechRound(view: AnyObj): number {
  const day = currentDay(view), me = youSeat(view);
  let count = 0;
  for (const e of logOf(view)) if (e.day === day && e.seat === me && (e.kind === 'speech' || e.kind === 'pass')) count++;
  return count + 1;
}

function publicEvidenceLine(view: AnyObj, candidate: number): string | null {
  const log = logOf(view);
  const relevant = log.filter(e => e.kind === 'vote' && intSeat(e.seat) && Number.isInteger(e.day));
  for (const e of relevant.slice().reverse()) {
    const exile = log.find(x => x.day === e.day && x.kind === 'exile' && x.seat === e.target);
    if (e.seat === candidate && exile && exile.role !== 'werewolf') {
      return `Seat ${candidate} voted to exile seat ${e.target}, who was revealed as a villager; we should question that vote.`;
    }
  }
  const claims = claimsFrom(view).filter(c => c.speaker === candidate && c.report);
  const contradiction = claims.find(c => c.report && knownStatus(view, c.report.seat) !== null && knownStatus(view, c.report.seat) !== c.report.werewolf);
  if (contradiction?.report) return `Seat ${candidate}'s seer claim conflicts with the revealed role of seat ${contradiction.report.seat}.`;
  return null;
}

function makeSpeech(view: AnyObj, game: number): string {
  const role = String(view?.you?.role ?? 'villager');
  const round = speechRound(view);
  if (role === 'seer') return seerSpeech(view, round);

  const claims = claimsFrom(view);
  if (role === 'werewolf') {
    const otherSeerClaim = claims.some(c => c.isSeer && c.speaker !== youSeat(view));
    if (currentDay(view) === 1 && round === 1 && !otherSeerClaim) {
      const target = wolfFakeSeerTarget(view, game);
      if (target !== null) return `I am the seer. I checked seat ${target} on night 1: they are a werewolf. We should vote seat ${target} today.`;
    }
  }

  const options = alivePlayers(view).map(p => p.seat).filter(s => s !== youSeat(view));
  if (role === 'werewolf' && partnerSeat(view) !== null) {
    const lead = chooseByScore(view, options.filter(s => s !== partnerSeat(view)), game, 2.2);
    if (lead !== null) {
      const evidence = publicEvidenceLine(view, lead);
      if (evidence) return evidence;
    }
  } else {
    const lead = chooseByScore(view, options, game, 1.3);
    if (lead !== null) {
      const evidence = publicEvidenceLine(view, lead);
      if (evidence) return evidence;
      const ownResult = role === 'seer' ? null : null;
      void ownResult;
      const liveClaim = claims.find(c => c.report?.werewolf && c.report.seat === lead);
      if (liveClaim) return `Seat ${liveClaim.speaker} claims a seer check on seat ${lead}. If the claim is credible, let's coordinate rather than split our votes.`;
      if (round === 1 && (suspicionScores(view).get(lead) ?? 0) > 2) return `Seat ${lead} is the clearest concern from the public votes and claims so far. What evidence supports a different target?`;
    }
  }
  return 'Before we split votes, please give one concrete reason for your suspect and coordinate on a single target.';
}

function chooseKill(view: AnyObj, options: number[], game: number): number | null {
  const partner = partnerSeat(view);
  const votes = Array.isArray(view.wolfVotes) ? view.wolfVotes : [];
  if (partner !== null) {
    const partnerPick = votes.find((v: any) => v?.night === currentDay(view) && v?.seat === partner && intSeat(v?.target));
    if (partnerPick) return partnerPick.target;
  }
  const claims = claimsFrom(view);
  const scores = suspicionScores(view);
  const speechCounts = new Map<number, number>();
  for (const e of logOf(view)) if (e.kind === 'speech' && intSeat(e.seat)) speechCounts.set(e.seat, (speechCounts.get(e.seat) ?? 0) + 1);
  const valid = options.filter(s => s !== youSeat(view) && s !== partner);
  valid.sort((a, b) => {
    const threat = (seat: number): number => {
      const roleClaims = claims.filter(c => c.speaker === seat && c.isSeer).length * 18;
      const directSeer = claims.filter(c => c.speaker === seat && c.report?.werewolf).length * 8;
      const doctorClaims = logOf(view).filter(e => e.kind === 'speech' && e.seat === seat && typeof e.text === 'string' && /\b(?:i am|i'm|im)\s+(?:the\s+)?doctor\b/i.test(e.text)).length * 10;
      const leadership = (speechCounts.get(seat) ?? 0) * 1.4;
      const suspicion = scores.get(seat) ?? 0;
      return roleClaims + directSeer + doctorClaims + leadership - Math.max(0, suspicion) * 1.6;
    };
    const diff = threat(b) - threat(a);
    return diff || stableRank(a, view, game) - stableRank(b, view, game);
  });
  return valid[0] ?? null;
}

function chooseProtect(view: AnyObj, options: number[], game: number): number | null {
  const claims = claimsFrom(view);
  const valid = options.filter(intSeat);
  valid.sort((a, b) => {
    const value = (seat: number): number => {
      const seerClaim = claims.some(c => c.speaker === seat && c.isSeer) ? 18 : 0;
      const hasResults = claims.filter(c => c.speaker === seat && c.report).length * 4;
      const influence = logOf(view).filter(e => e.kind === 'speech' && e.seat === seat).length * 1.5;
      const votesAgainst = currentVotes(view).counts.get(seat) ?? 0;
      return seerClaim + hasResults + influence + votesAgainst * 0.8;
    };
    const diff = value(b) - value(a);
    return diff || stableRank(a, view, game) - stableRank(b, view, game);
  });
  return valid[0] ?? null;
}

export function chooseAction(pending: AnyObj): AnyObj {
  const view: AnyObj = isObj(pending?.view) ? pending.view : {};
  const game = Number.isInteger(pending?.game) ? pending.game : 1;
  const decision = String(pending?.decision ?? '');
  const options: number[] = Array.isArray(pending?.options) ? pending.options.filter(intSeat) : [];
  if (decision === 'speak') return { game, decision, text: makeSpeech(view, game) };
  if (decision === 'inspect') return { game, decision, target: chooseByScore(view, options, game, 0.5) };
  if (decision === 'protect') return { game, decision, target: chooseProtect(view, options, game) };
  if (decision === 'kill') return { game, decision, target: chooseKill(view, options, game) };
  if (decision === 'vote') {
    const role = String(view?.you?.role ?? 'villager');
    const partner = role === 'werewolf' ? partnerSeat(view) : null;
    const valid = options.filter(s => s !== partner);
    if (role === 'werewolf' && partner !== null) {
      const partnerVote = currentVotes(view).bySeat.get(partner);
      if (intSeat(partnerVote) && valid.includes(partnerVote)) return { game, decision, target: partnerVote };
    }
    return { game, decision, target: chooseByScore(view, valid, game, role === 'werewolf' ? 2.2 : 2.4) };
  }
  return { game, decision: decision || 'vote', target: null };
}

function oneLine(text: string): string {
  return text.replace(/[\t\n\v\f\r\u0085\u2028\u2029]+/g, ' ').replace(/\p{Cc}/gu, '').trim();
}

async function postJson(base: string, route: string, body: unknown): Promise<any> {
  const response = await fetch(`${base}${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(35_000),
  });
  const text = await response.text();
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { throw new Error(`${route} returned non-JSON HTTP ${response.status}`); }
  if (!response.ok) throw new Error(`${route} returned HTTP ${response.status}: ${JSON.stringify(parsed).slice(0, 400)}`);
  return parsed;
}

/** Serve every pending decision until the env marks the complete trial done. */
export async function run(env: Record<string, string | undefined> = process.env): Promise<void> {
  const base = (env.MAKEFUN_ENV_URL ?? '').replace(/\/+$/, '');
  if (!base) throw new Error('MAKEFUN_ENV_URL is required');
  for (;;) {
    const observed = await postJson(base, '/observe', {});
    if (observed?.done === true) break;
    const pending = Array.isArray(observed?.pending) ? observed.pending : [];
    for (const p of pending) {
      if (!isObj(p) || !Number.isInteger(p.game) || typeof p.decision !== 'string') continue;
      let action = chooseAction(p);
      if (p.decision === 'speak') {
        const text = oneLine(String(action.text ?? 'Ready to compare evidence and coordinate the vote.'));
        const max = Number.isInteger(p.max_chars) ? p.max_chars : 500;
        action = text.length > 0 ? { game: p.game, decision: 'speak', text: [...text].slice(0, max).join('') } : { game: p.game, decision: 'speak', pass: true };
      }
      const result = await postJson(base, '/act', action);
      if (result?.success === false) throw new Error(`/act refused an action for game ${p.game}`);
    }
  }
}

const isMain = process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  run().then(() => process.stderr.write('werewolf-agent: all games finished\n')).catch((err: unknown) => {
    process.stderr.write(`werewolf-agent: ${(err as Error).stack ?? String(err)}\n`);
    process.exitCode = 1;
  });
}
