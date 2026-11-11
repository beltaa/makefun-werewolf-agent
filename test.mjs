import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseAction, claimsFrom, knownStatus, suspicionScores } from './main.ts';

function baseView(overrides = {}) {
  return {
    day: 1,
    phase: 'voting',
    you: { seat: 1, name: 'Ari', role: 'villager', alive: true, partner: null },
    players: Array.from({ length: 8 }, (_, i) => ({ seat: i + 1, name: `P${i + 1}`, alive: true, role: null })),
    seerResults: null,
    lastProtect: null,
    wolfVotes: null,
    log: [],
    outcome: null,
    ...overrides,
  };
}

test('a seer votes for a privately confirmed werewolf', () => {
  const view = baseView({
    you: { seat: 1, name: 'Ari', role: 'seer', alive: true, partner: null },
    seerResults: [{ night: 1, seat: 4, werewolf: true }],
  });
  const action = chooseAction({ game: 3, decision: 'vote', options: [2, 3, 4, 5, 6, 7, 8], view });
  assert.equal(action.target, 4);
  assert.equal(knownStatus(view, 4), true);
});

test('a seer does not vote for a privately cleared target when another option exists', () => {
  const view = baseView({
    you: { seat: 1, name: 'Ari', role: 'seer', alive: true, partner: null },
    seerResults: [{ night: 1, seat: 4, werewolf: false }],
  });
  const action = chooseAction({ game: 4, decision: 'vote', options: [2, 3, 4, 5, 6, 7, 8], view });
  assert.notEqual(action.target, 4);
});

test('the second werewolf copies the partner night vote exactly', () => {
  const view = baseView({
    day: 2,
    phase: 'night',
    you: { seat: 3, name: 'C', role: 'werewolf', alive: true, partner: { seat: 6, name: 'F', alive: true } },
    wolfVotes: [{ night: 2, seat: 6, target: 5 }],
  });
  const action = chooseAction({ game: 8, decision: 'kill', options: [1, 2, 4, 5, 7, 8], view });
  assert.equal(action.target, 5);
});

test('wolf first-cycle fake seer claim cannot name itself or its partner', () => {
  const view = baseView({
    phase: 'debate',
    you: { seat: 1, name: 'Ari', role: 'werewolf', alive: true, partner: { seat: 6, name: 'F', alive: true } },
  });
  const action = chooseAction({ game: 2, decision: 'speak', max_chars: 500, view });
  assert.match(action.text, /I am the seer/i);
  const match = /checked seat (\d+)/i.exec(action.text);
  assert.ok(match);
  assert.ok(![1, 6].includes(Number(match[1])));
  assert.ok([...action.text].length <= 500);
});

test('a true seer reports its actual inspection result', () => {
  const view = baseView({
    phase: 'debate',
    you: { seat: 1, name: 'Ari', role: 'seer', alive: true, partner: null },
    seerResults: [{ night: 1, seat: 4, werewolf: false }],
  });
  const action = chooseAction({ game: 1, decision: 'speak', max_chars: 500, view });
  assert.match(action.text, /I am the seer/i);
  assert.match(action.text, /seat 4: not a werewolf/i);
});

test('a false public seer result contradicted by a revealed role marks the claimant suspicious', () => {
  const players = baseView().players;
  players[3].role = 'villager';
  players[3].alive = false;
  const view = baseView({
    players,
    log: [{ seq: 1, day: 1, kind: 'speech', seat: 2, round: 1, text: 'I am the seer. I checked seat 4 on night 1: they are a werewolf.' }],
  });
  const claim = claimsFrom(view)[0];
  assert.equal(claim?.isSeer, true);
  assert.deepEqual(claim?.report, { seat: 4, werewolf: true });
  assert.equal(knownStatus(view, 4), false);
  assert.ok((suspicionScores(view).get(2) ?? 0) >= 30);
});

test('doctor protects the living player who publicly claims seer', () => {
  const view = baseView({
    phase: 'night',
    you: { seat: 1, name: 'Ari', role: 'doctor', alive: true, partner: null },
    log: [{ seq: 1, day: 1, kind: 'speech', seat: 4, round: 1, text: 'I am the seer; I checked seat 6 and found no wolf.' }],
  });
  const action = chooseAction({ game: 5, decision: 'protect', options: [2, 3, 4, 5, 6, 7, 8], view });
  assert.equal(action.target, 4);
});

test('all selected vote and inspect targets come from the legal options', () => {
  const view = baseView();
  for (const decision of ['vote', 'inspect']) {
    const options = [2, 4, 7];
    const action = chooseAction({ game: 9, decision, options, view });
    assert.ok(options.includes(action.target), `${decision} target ${action.target} is invalid`);
  }
});

test('view updates after an exile and never treats revealed village roles as suspects', () => {
  const players = baseView().players;
  players[4].alive = false;
  players[4].role = 'villager';
  const view = baseView({ players, log: [{ seq: 1, day: 1, kind: 'exile', seat: 5, role: 'villager', tally: [{ seat: 5, votes: 3 }] }] });
  assert.equal(knownStatus(view, 5), false);
});
