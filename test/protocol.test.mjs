// Live-room protocol helpers that run on the host: player names.
import assert from 'node:assert/strict';
import { safeName, uniqueName } from '../src/protocol.js';

assert.equal(safeName('  Ann\u0007  '), 'Ann', 'control characters and padding are stripped');
assert.equal(safeName(''), 'Player');
assert.equal(uniqueName('You', ['DeskHost']), 'You', 'a free name is kept');
assert.equal(uniqueName('You', ['DeskHost', 'You']), 'You 2', 'the second "You" is numbered');
assert.equal(uniqueName('you', ['You', 'You 2']), 'you 3', 'matching ignores case and skips taken numbers');
assert.equal(uniqueName('Maximilianopqr', ['Maximilianopqr']), 'Maximilianop 2', 'a numbered name still fits 14 characters');
console.log('Protocol OK: names are cleaned and repeats numbered.');

// Waiting room: guests find their own card by a token tag, the token itself never leaves the host, settings are clamped.
import { lobbyPublic, tokenTag, safeRoom, safeOrder } from '../src/protocol.js';
const lobby = lobbyPublic([{ name: 'Host', host: true }, { name: 'Ann', token: 'a7f3c0de-1111', ready: true }]);
assert.equal(lobby[0].tag, undefined, 'the host (no token) gets no tag');
assert.equal(lobby[1].tag, tokenTag('a7f3c0de-1111'), 'a guest gets the tag of its own token');
assert.ok(!('token' in lobby[1]), 'the token is stripped');
assert.notEqual(tokenTag('a'), tokenTag('b'));
assert.deepEqual(safeRoom({ courseId: 'lake', holes: 3, order: 'through' }, ['pine', 'lake']), { courseId: 'lake', holes: 3, order: 'through' });
assert.deepEqual(safeRoom({ courseId: '<x>', holes: 99, order: 'chaos' }, ['pine', 'lake']), { courseId: 'pine', holes: 9, order: 'away' });
assert.equal(safeOrder(undefined), 'away');
console.log('Protocol OK: waiting-room tags and settings.');
