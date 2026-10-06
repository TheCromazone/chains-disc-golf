// Invite-match rules and storage: turn order, catch-up for late joiners, honours, validation, secrets, and lost-race retries.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMatch, joinMatch, seatPlayer, playTurn, nextTurn, isFinished, markAway, markBack, addPush, publicMatch, cleanAvatar, MatchError, AWAY_AFTER_MS } from '../server/match-core.js';

const pars = [3, 4, 3];
const { match: m, seat: hostSeat } = createMatch({ name: 'Matt', avatar: { jersey: '#ff4d3d', hair: 'short' }, courseId: 'pine', courseName: 'Pine Hollow', holeCount: 3, pars }, 1000);
assert.equal(m.turn.pid, hostSeat.pid, 'the creator tees off at once, before anyone joins');
assert.throws(() => createMatch({ name: 'x', courseId: 'nowhere', holeCount: 9 }), MatchError);
assert.throws(() => createMatch({ name: 'x', courseId: 'pine', holeCount: 18 }), MatchError);

const host = seatPlayer(m, hostSeat.pid, hostSeat.token);
assert.throws(() => seatPlayer(m, hostSeat.pid, 'wrong-token'), MatchError, 'a wrong seat token is refused');

// Matt plays hole 1 alone, then Alex and Sam join: the late joiners catch up before Matt plays on.
playTurn(m, host, { hole: 0, strokes: 3, throws: [{ t: 'backhand', d: 'driver', m: 70 }, { t: 'putt', d: 'putter', m: 9, holed: true }] }, 2000);
assert.equal(m.turn.pid, host.id, 'alone, the creator may keep playing');
const { seat: alexSeat } = joinMatch(m, { name: 'Alex' }, 3000), alex = seatPlayer(m, alexSeat.pid, alexSeat.token);
const { seat: samSeat } = joinMatch(m, { name: 'Sam<script>' }, 3100), sam = seatPlayer(m, samSeat.pid, samSeat.token);
assert.equal(sam.name, 'Samscript', 'names are stripped of markup');
assert.equal(m.turn.pid, host.id, 'a join never takes the turn from whoever is up');
assert.throws(() => playTurn(m, alex, { hole: 0, strokes: 3 }), MatchError, 'only the player who is up may play');
assert.throws(() => playTurn(m, host, { hole: 0, strokes: 4 }), MatchError, 'a hole is recorded once');
playTurn(m, host, { hole: 1, strokes: 4 }, 4000);
assert.equal(m.turn.pid, alex.id, 'whoever has played the fewest holes is up next (catch-up)');
playTurn(m, alex, { hole: 0, strokes: 2 }, 5000);
assert.equal(m.turn.pid, sam.id);
playTurn(m, sam, { hole: 0, strokes: 4 }, 6000);
assert.equal(m.turn.pid, alex.id, 'Alex (birdie on 1) has honours over Sam (bogey) on hole 2');
playTurn(m, alex, { hole: 1, strokes: 5 }, 7000);
assert.equal(m.turn.pid, sam.id);
assert.throws(() => playTurn(m, sam, { hole: 1, strokes: 0 }), MatchError, 'impossible scores are refused');
assert.throws(() => playTurn(m, sam, { hole: 1, strokes: 40 }), MatchError);
playTurn(m, sam, { hole: 1, strokes: 4 }, 8000);
// Hole 3: everyone on 2 holes; honours by the hole-2 score: Matt 4, Sam 4, Alex 5; tie broken by the total (Matt 7, Sam 8).
assert.equal(m.turn.pid, host.id, 'ties for honours fall to the better total');

// Sam sits on his turn; others may step past after 30 minutes, and he comes back by playing.
playTurn(m, host, { hole: 2, strokes: 3 }, 9000);
assert.equal(m.turn.pid, sam.id);
assert.throws(() => markAway(m, alex, sam.id, 9000 + 60_000), MatchError, 'too soon to skip someone');
markAway(m, alex, sam.id, 9000 + AWAY_AFTER_MS + 1);
assert.equal(m.turn.pid, alex.id, 'the turn passes over an away player');
playTurn(m, alex, { hole: 2, strokes: 3 }, 10_000_000);
assert.equal(m.turn, null, 'nobody active is left to play');
assert.equal(isFinished(m), true, 'away players do not hold the match open');
markBack(m, sam, 10_000_001);
assert.equal(m.turn.pid, sam.id, 'coming back reopens the turn for them');
assert.equal(isFinished(m), false);
playTurn(m, sam, { hole: 2, strokes: 2 }, 10_000_002);
assert.equal(isFinished(m), true);
assert.throws(() => joinMatch(m, { name: 'Late' }), MatchError, 'a finished match takes no new players');

// Secrets never leave the server.
addPush(alex, { endpoint: 'https://push.example/abc', keys: { p256dh: 'k', auth: 'a' } });
assert.throws(() => addPush(alex, { endpoint: 'javascript:alert(1)', keys: { p256dh: 'k', auth: 'a' } }), MatchError);
const view = JSON.stringify(publicMatch(m, alex));
assert(!view.includes('tokenHash') && !view.includes('push.example') && !view.includes(hostSeat.token), 'no token hashes, tokens or push endpoints in a public view');
assert.equal(publicMatch(m, alex).players.find(p => p.id === alex.id).alerts, true);
assert.deepEqual(cleanAvatar({ jersey: 'red"><img src=x onerror=alert(1)>', hair: 'short', n: 3 }), { hair: 'short', n: 3 }, 'avatars carry no markup');

// Twelve players at most.
const { match: big } = createMatch({ name: 'H', courseId: 'lake', holeCount: 3 });
for (let i = 0; i < 11; i++) joinMatch(big, { name: 'P' + i });
assert.throws(() => joinMatch(big, { name: 'P13' }), /full/);

// Storage: two writers racing on the same match both land (the loser re-reads and re-applies).
const dir = mkdtempSync(join(tmpdir(), 'chains-store-')); process.env.CHAINS_DATA_DIR = dir; delete process.env.BLOB_READ_WRITE_TOKEN;
const { saveMatch, loadMatch, loadMatchFresh, updateMatch, Conflict } = await import('../server/store.js');
const { match: s } = createMatch({ name: 'Host', courseId: 'meadow', holeCount: 9 });
await saveMatch(s.id, s, null);
await assert.rejects(saveMatch(s.id, s, null), Conflict, 'creating over an existing match is a conflict');
await Promise.all(Array.from({ length: 8 }, (_, i) => updateMatch(s.id, x => joinMatch(x, { name: 'J' + i }))));
assert.equal((await loadMatch(s.id)).data.players.length, 9, 'eight racing joins all land, none overwritten');
// Polls read through the instance's copy (each origin read spends the Blob store's monthly budget); a newer seq skips it.
const fresh = await loadMatchFresh(s.id); assert.equal(fresh.data.seq, (await loadMatch(s.id)).data.seq, 'a poll after a write sees that write');
fresh.data.players.length = 0; assert.equal((await loadMatchFresh(s.id)).data.players.length, 9, 'callers get a copy, never the cached object');
const behind = structuredClone((await loadMatch(s.id)).data); behind.seq += 5; behind.courseName = 'Elsewhere';
const { writeFile } = await import('node:fs/promises'); await writeFile(join(dir, 'matches', `${s.id}.json`), JSON.stringify(behind));   // another instance's write
assert.notEqual((await loadMatchFresh(s.id)).data.courseName, 'Elsewhere', 'within the window the poll is served from this instance');
assert.equal((await loadMatchFresh(s.id, 4000, behind.seq)).data.courseName, 'Elsewhere', 'asking for a newer seq goes to the origin');
rmSync(dir, { recursive: true, force: true });

console.log('Invite matches OK: catch-up turns, honours, away/back, validation, secrets and racing writes.');
