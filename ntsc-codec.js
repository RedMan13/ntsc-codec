const stream = require('stream');
const { hsvToRgb } = {}// require('./color');
const path = require('path');
const fs = require('fs');

// written to the best understanding i have of the specifications listed at https://antiqueradio.org/art/NTSC%20Signal%20Specifications.pdf
// and also the specifications listed at https://www.eetimes.com/measuring-composite-video-signal-performance-requires-understanding-differential-gain-and-phase-part-1-of-2/
// why is there so little solid documentation that can easily be found? i had the same issue with RIFF files

// design note: a "frame" is all data between two verticle sync pulses, or half of a frame as many people will attempt to tell you.
// this is because saying NTSC runs at 30fps is quite frankly disgustingly dishonest. as the signal is intended for CRT TVs
// who will, to the human eye, render each interlaced frame as a UNIQUE frame. this fact is doubled down by that fact that
// the only thing to EVER send the picture in both halves, are nothing. everything either only sent half a frame, or sent
// a new point in time for each interlaced half.

const audioFrequency = 440000; // some ludicrus number i derived from the pixel resolution
const sampleLength = 1 / audioFrequency;
const byteWidth = 4;

const frameHeight = 483;
const frameWidth = frameHeight * (4 / 3); // derivative of the above, real width is theoretically infinite
const frameLength = frameWidth * frameHeight;
const framePixels = frameLength * 3;

const lineSampleWidth = 764;
const linePictureWidth = (lineSampleWidth - (lineSampleWidth * 0.165));
const samplesPerPixel = linePictureWidth / frameWidth;
const pixelsPerSample = 1 / samplesPerPixel;
const whiteLevel = 0x8FFFFFFF;
const blackLevel = Math.floor(whiteLevel * 0.25);
const syncLevel = 0;

const cyclesInBurst = 8;
const colorBurstRange = (blackLevel - syncLevel) * 0.9;
const backPorchLength = (lineSampleWidth * 0.02);
const syncPulseLength = (lineSampleWidth * 0.075);
const frontPorchPre = (lineSampleWidth * 0.006);
const colorBurstLength = lineSampleWidth * 0.044;
const frontPorchPost = (lineSampleWidth * 0.02);
const bytesPerCycle = (colorBurstLength / cyclesInBurst) * 2;

const verticleBlankingSamples = lineSampleWidth * (3 + 3 + 3 + 42);
const verticleSyncLongLength = lineSampleWidth * 0.46;
const verticleSyncShortLength = lineSampleWidth * 0.04;

const wave = new Array(Math.floor(6)).fill(0).map((_,i,a) => Math.sin((i / (a.length -1)) * Math.PI *2))// Math.sin((i / 32) * (cyclesInBurst * Math.PI *2)));
console.log(wave);
wave.forEach(sig => console.log(' '.repeat((sig * 16) + 16) + '#'))

class Transformer {
    idx = 0;
    constructor() {}
    /**
     * @type {Function} Transforms one frame of data into an ntsc signal
     * @param {Buffer} chunk The frame data to transform, must be exactly 644x483 RGB, one byte per channel
     */
    to = new Function('chunk', `
        console.time();
        const samples = Buffer.alloc(${Math.ceil((lineSampleWidth * frameHeight) + verticleBlankingSamples) * 4});
        let syncIdx = 0;
        let colorDeg = 0;
        let i = 0, r,g,b, t,q,j;
        let oddLine = false;

        for (let i = 0; i < ${framePixels}; i += 3) {
            if (!(i % ${frameWidth})) {
                oddLine = !oddLine;
                ${`samples.writeUInt32LE(${blackLevel}, syncIdx); syncIdx += ${byteWidth}; this.idx++; `.repeat(backPorchLength)}
                ${`syncIdx += ${Math.floor(syncPulseLength) * byteWidth}; this.idx += ${Math.floor(syncPulseLength)}`}
                ${`samples.writeUInt32LE(${blackLevel}, syncIdx); syncIdx += ${byteWidth}; this.idx++; `.repeat(frontPorchPre)}
                ${`samples.writeUInt32LE(${blackLevel} + (${colorBurstRange / 2} * Math.sin(oddLine
                    ? ((this.idx / ${colorBurstLength}) * ${cyclesInBurst * Math.PI *2}) + Math.PI
                    : (this.idx / ${colorBurstLength}) * ${cyclesInBurst * Math.PI *2})), syncIdx); syncIdx += ${byteWidth}; this.idx++; `.repeat(colorBurstLength)}
                ${`samples.writeUInt32LE(${blackLevel}, syncIdx); syncIdx += ${byteWidth}; this.idx++; `.repeat(frontPorchPost)}
            }
            r = chunk[i] / 255;
            g = chunk[i +1] / 255;
            b = chunk[i +2] / 255;
            t = (r * 0.30) + (g * 0.59) + (b * 0.11);
            q = (0.41 * (b - t)) + (0.48 * (r - t));
            j = (-0.27 * (b - t)) + (0.47 * (r - t));
            colorDeg = oddLine
                ? ((this.idx / ${colorBurstLength}) * ${cyclesInBurst * Math.PI *2}) + Math.PI
                : (this.idx / ${colorBurstLength}) * ${cyclesInBurst * Math.PI *2};
            ${`samples.writeUInt32LE(${blackLevel} + (t * ${whiteLevel - blackLevel}) + (${whiteLevel / 2} * ((q * Math.sin(colorDeg)) + (j * Math.cos(colorDeg)))), syncIdx); syncIdx += ${byteWidth}; this.idx++; `.repeat(samplesPerPixel)}
        }

        ${`syncIdx += ${Math.floor(verticleSyncShortLength) * byteWidth}; this.idx += ${Math.floor(verticleSyncShortLength)}`}
        ${`samples.writeUInt32LE(${blackLevel}, syncIdx); syncIdx += ${byteWidth}; this.idx++; `.repeat(verticleSyncLongLength)}
        ${`syncIdx += ${Math.floor(verticleSyncShortLength) * byteWidth}; this.idx += ${Math.floor(verticleSyncShortLength)}`}
        ${`samples.writeUInt32LE(${blackLevel}, syncIdx); syncIdx += ${byteWidth}; this.idx++; `.repeat(verticleSyncLongLength)}
        ${`syncIdx += ${Math.floor(verticleSyncShortLength) * byteWidth}; this.idx += ${Math.floor(verticleSyncShortLength)}`}
        ${`samples.writeUInt32LE(${blackLevel}, syncIdx); syncIdx += ${byteWidth}; this.idx++; `.repeat(verticleSyncLongLength)}

        ${`syncIdx += ${Math.floor(verticleSyncLongLength) * byteWidth}; this.idx += ${Math.floor(verticleSyncLongLength)}`}
        ${`samples.writeUInt32LE(${blackLevel}, syncIdx); syncIdx += ${byteWidth}; this.idx++; `.repeat(verticleSyncShortLength)}
        ${`syncIdx += ${Math.floor(verticleSyncLongLength) * byteWidth}; this.idx += ${Math.floor(verticleSyncLongLength)}`}
        ${`samples.writeUInt32LE(${blackLevel}, syncIdx); syncIdx += ${byteWidth}; this.idx++; `.repeat(verticleSyncShortLength)}
        ${`syncIdx += ${Math.floor(verticleSyncLongLength) * byteWidth}; this.idx += ${Math.floor(verticleSyncLongLength)}`}
        ${`samples.writeUInt32LE(${blackLevel}, syncIdx); syncIdx += ${byteWidth}; this.idx++; `.repeat(verticleSyncShortLength)}
        
        ${`syncIdx += ${Math.floor(verticleSyncShortLength) * byteWidth}; this.idx += ${Math.floor(verticleSyncShortLength)}`}
        ${`samples.writeUInt32LE(${blackLevel}, syncIdx); syncIdx += ${byteWidth}; this.idx++; `.repeat(verticleSyncLongLength)}
        ${`syncIdx += ${Math.floor(verticleSyncShortLength) * byteWidth}; this.idx += ${Math.floor(verticleSyncShortLength)}`}
        ${`samples.writeUInt32LE(${blackLevel}, syncIdx); syncIdx += ${byteWidth}; this.idx++; `.repeat(verticleSyncLongLength)}
        ${`syncIdx += ${Math.floor(verticleSyncShortLength) * byteWidth}; this.idx += ${Math.floor(verticleSyncShortLength)}`}
        ${`samples.writeUInt32LE(${blackLevel}, syncIdx); syncIdx += ${byteWidth}; this.idx++; `.repeat(verticleSyncLongLength)}
        ${`
            oddLine = !oddLine;
            ${`samples.writeUInt32LE(${blackLevel}, syncIdx); syncIdx += ${byteWidth}; this.idx++; `.repeat(backPorchLength)}
            ${`syncIdx += ${Math.floor(syncPulseLength) * byteWidth}; this.idx += ${Math.floor(syncPulseLength)}`}
            ${`samples.writeUInt32LE(${blackLevel}, syncIdx); syncIdx += ${byteWidth}; this.idx++; `.repeat(frontPorchPre)}
            ${`samples.writeUInt32LE(${blackLevel} + (${colorBurstRange / 2} * Math.sin(oddLine
                ? ((this.idx / ${colorBurstLength}) * ${cyclesInBurst * Math.PI *2}) + Math.PI
                : (this.idx / ${colorBurstLength}) * ${cyclesInBurst * Math.PI *2})), syncIdx); syncIdx += ${byteWidth}; this.idx++; `.repeat(colorBurstLength)}
            ${`samples.writeUInt32LE(${blackLevel}, syncIdx); syncIdx += ${byteWidth}; this.idx++; `.repeat(frontPorchPost)}
        `.repeat(42)}
        console.timeEnd();
        return samples;
    `);
    *from(samples) {
        console.time()
        let chunk = Buffer.alloc(framePixels);
        let x = 0, y = -1;
        let once = true;
        let blackLevel = Math.floor(whiteLevel * 0.25);
        let previousLine = new Array(Math.floor(lineSampleWidth)).fill(0);
        let line = new Array(Math.floor(lineSampleWidth)).fill(0);
        for (let i = 0; i < samples.length; i += byteWidth) {
            const sample = samples.readUInt32LE(i);
            this.idx++;
            if (sample < 16) {
                // wait until we FINISH the sync region
                if (line.length < syncPulseLength) continue;
                x = frameWidth + ((colorBurstLength + frontPorchPre + frontPorchPost) * pixelsPerSample);
                if (!once) {
                    const luma = line.map((v,i) => (previousLine[i] + v) / 2);
                    const chroma = line.map((v,i) => v - luma[i]);
                    const frequency = line.slice(frontPorchPre, frontPorchPre + colorBurstLength).map(v => (v - blackLevel) / (colorBurstRange / 2));
                    frequency.push(frequency.shift());
                    frequency.push(frequency.shift()); 
                    frequency.push(frequency.shift()); 
                    frequency.push(frequency.shift()); 
                    frequency.push(frequency.shift()); 
                    // rotate five samples to adjust for the true start of a line
                    line.forEach((sample, idx) => {
                        x -= pixelsPerSample;
                        if (x > frameWidth) return;
                        const value = (luma[idx] - blackLevel) / (whiteLevel - blackLevel);
                        const chromaWindow = chroma.slice(idx - bytesPerCycle, idx);
                        const saturation = chromaWindow.reduce((c,v) => Math.max(c,v), 0);
                        const phase = y % 2
                            ? (chromaWindow.indexOf(saturation) + (bytesPerCycle / 4)) / bytesPerCycle
                            : chromaWindow.indexOf(saturation) / bytesPerCycle; // (chroma[idx] / saturation) - frequency[idx % frequency.length]
                        const [r,g,b] = hsvToRgb({ h: phase * 360, s: saturation / (whiteLevel / 2), v: value });
                        const px = (Math.floor(frameWidth - x) + (y * frameWidth)) * 3;
                        chunk[px] = r;
                        chunk[px +1] = g;
                        chunk[px +2] = b;
                    });
                    previousLine = line;
                    line = new Array();
                    blackLevel = 0;
                    y++;
                    once = true;
                }
                continue;
            }
            // black level can NEVER equal a sync level, make sure to enforce this
            if (blackLevel < 10) blackLevel = sample;
            line.push(sample);
            once = false;
            if (y >= frameHeight) {
                console.timeEnd();
                yield chunk;
                y = 0;
                chunk = Buffer.alloc(framePixels);
            }
        }
        console.timeEnd();
        return chunk;
    }
}

if (path.resolve(process.argv[1]) === __filename) (async () => {
    const sharp = require('sharp');
    const trans = new Transformer();
    // input is a pcm file, assume its ntsc video data
    if (path.extname(process.argv[2]) === '.pcm') {
        const data = fs.readFileSync(process.argv[2]);
        sharp(trans.from(data).next().value, { raw: { channels: 3, width: frameWidth, height: frameHeight } })
            .removeAlpha()
            .resize(frameWidth, frameHeight)
            .png()
            .toFile(process.argv[3]);
        return;
    }
    const image = path.extname(argv[2]) === '.bin' 
        ? fs.readFileSync(process.argv[2]) 
        : await sharp(process.argv[2])
            .removeAlpha()
            .resize(frameWidth, frameHeight)
            .raw()
            .toBuffer();
    fs.writeFileSync(process.argv[3], trans.to(image));
})();