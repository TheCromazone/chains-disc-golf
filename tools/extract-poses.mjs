import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync('src/player.js', 'utf8');
const joints = source.match(/const JOINTS = ([^;]+);/)[1];
const idle = source.match(/const IDLE = ([^;]+);/)[1];
const keys = source.slice(source.indexOf('const K = ') + 10, source.indexOf('\nfunction poseAt')).trim().replace(/;$/, '');
const data = vm.runInNewContext(`({ joints: ${joints}, idle: ${idle}, throws: ${keys} })`);
writeFileSync('tools/poses.json', JSON.stringify(data, null, 2));
