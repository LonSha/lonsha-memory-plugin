import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
test('probe', () => { fs.writeFileSync("/home/user/lonsha-memory-plugin/tests/.zz_v3431_seen.txt", os.tmpdir()); });
