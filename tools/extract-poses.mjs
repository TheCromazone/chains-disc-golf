import { writeFileSync } from 'node:fs';
import { JOINTS, IDLE, K, RUNUPS } from '../src/throw-poses.js';
writeFileSync('tools/poses.json', JSON.stringify({joints:JOINTS,idle:IDLE,throws:{...K,...RUNUPS}},null,2)+'\n');
