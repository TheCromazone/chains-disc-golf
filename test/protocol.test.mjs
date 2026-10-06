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
