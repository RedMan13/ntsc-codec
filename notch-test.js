const sampleRate = 24262214;
const checks = 1000;
const top = Math.PI *2;
const bottom = 0;
const walk = (top - bottom) / checks;
const { fft } = require('fft-js');

const responses = [];
for (let i = top; i > bottom; i -= walk) {
    const samples = new Array(4)
        .fill(0)
        .map((_,j,a) => Math.sin(i + ((j / a.length) * Math.PI *2)));
    let phase = 0;
    phase = top * (samples[0]);
    responses.push(0.5 + (((i - phase) / top) / 2));
}

const { Window } = require('skia-canvas');
const win = new Window();
const ctx = win.canvas.getContext('2d');
ctx.beginPath();
ctx.moveTo(0, win.height - (responses[0] * (win.height / 2)));
for (let i = 1; i < responses.length; i++) ctx.lineTo(i * win.width / responses.length, win.height - (responses[i] * win.height));
ctx.stroke();
ctx.textBaseline = 'top';
ctx.textAlign = 'left';
ctx.fillText(top, 3, 10);
ctx.textAlign = 'right';
ctx.fillText(bottom, win.width - 3, 10);
console.log(responses);
