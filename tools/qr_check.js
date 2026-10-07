// Writes PGM images of QR codes for tools/qr_check.py to decode.
const fs = require('fs'), QR = require('../public/qr.js');
const samples = ['a', 'hello world', '12.abcdefghijk.abcdefghijklmnop', '123456.Zx9_-Ab3Qw8.k3J9_x-Lm0pQ2r4t', 'x'.repeat(40), 'y'.repeat(60), 'z'.repeat(90), 'unicode: ঢাকা ✓'];
samples.forEach((t, n) => { const m = QR.matrix(t), S = 10, B = 4, W = (m.length + 2 * B) * S, buf = Buffer.alloc(W * W, 255);
  m.forEach((r, y) => r.forEach((c, x) => { if (c) for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) buf[((y + B) * S + dy) * W + (x + B) * S + dx] = 0; }));
  fs.writeFileSync(`/tmp/qr_${n}.pgm`, Buffer.concat([Buffer.from(`P5 ${W} ${W} 255\n`), buf])); fs.writeFileSync(`/tmp/qr_${n}.txt`, t); });
console.log(samples.length);
