const fs = require('fs');
const path = require('path');
const child = require('child_process');

const files = fs.readdirSync(process.argv[3]);
for (const file of files) {
    const real = path.resolve(process.argv[3], file);
    const res = path.resolve(process.argv[4], file + '.out');
    child.execFileSync(path.resolve(__dirname, './dev'), [process.argv[2], real, res]);
}