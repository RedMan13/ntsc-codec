const sampleRate = 24262214;
const checks = 1000;
const top = Math.PI *2;
const bottom = 0;
const walk = (top - bottom) / checks;

const responses = [];
for (let i = top; i > bottom; i -= walk) {
    const samples = new Array(4)
        .fill(0)
        .map((_,j,a) => Math.sin(i + ((j / a.length) * Math.PI *2)));
    let phase = 0;
    phase = Math.atan2(samples[0] - samples[2], samples[1] - samples[3]);
    responses.push(0.5 + ((((((i % top) + top) % top) - phase) / top) / 2));
}

const { Window } = require('skia-canvas');
const win = new Window();
const ctx = win.canvas.getContext('2d');
ctx.fillStyle = '#3E55';
ctx.beginPath();
ctx.moveTo(0, win.height);
ctx.lineTo(0, win.height - (responses[0] * (win.height / 2)));
for (let i = 1; i < responses.length; i++) ctx.lineTo(i * win.width / responses.length, win.height - (responses[i] * win.height));
ctx.lineTo(win.width, win.height);
ctx.closePath();
ctx.stroke();
ctx.fill();

ctx.beginPath();
ctx.strokeStyle = '#E53E';
for (let i = 0; i < 4; i++) {
    ctx.moveTo((i / 4) * win.width, 0);
    ctx.lineTo((i / 4) * win.width, win.height);
}
ctx.stroke();

ctx.textBaseline = 'top';
ctx.fillStyle = 'black';
ctx.strokeStyle = 'white';
ctx.textAlign = 'left';
ctx.strokeText(top, 3, 10);
ctx.fillText(top, 3, 10);
ctx.textAlign = 'right';
ctx.strokeText(bottom, win.width - 3, 10);
ctx.fillText(bottom, win.width - 3, 10);
console.log(responses);
