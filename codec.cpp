#include <cmath>
#include <iostream>

// written to the best understanding i have of the specifications listed at https://antiqueradio.org/art/NTSC%20Signal%20Specifications.pdf
// and also the specifications listed at https://www.eetimes.com/measuring-composite-video-signal-performance-requires-understanding-differential-gain-and-phase-part-1-of-2/
// why is there so little solid documentation that can easily be found? i had the same issue with RIFF files

// design note: a "frame" is all data between two verticle sync pulses, or half of a frame as many people will attempt to tell you.
// this is because saying NTSC runs at 30fps is quite frankly disgustingly dishonest. as the signal is intended for CRT TVs
// who will, to the human eye, render each interlaced frame as a UNIQUE frame. this fact is doubled down by that fact that
// the only thing to EVER send the picture in both halves, are nothing. everything either only sent half a frame, or sent
// a new point in time for each interlaced half.

#define AUDIO_FREQUENCY 14332501 // some ludicrus number i derived from the cycle frequency table below
#define SAMPLE_LENGTH (1 / AUDIO_FREQUENCY)

#define FRAME_HEIGHT ((525 / 2) - (VERTICLE_BLANK_LINES + VERTICLE_SYNC_LENGTH))
#define FRAME_WIDTH (int)((FRAME_HEIGHT * 2) * (4.0 / 3.0)) // derivative of the above, real width is theoretically infinite
#define FRAME_LENGTH (FRAME_WIDTH * FRAME_HEIGHT)
#define FRAME_PIXELS (FRAME_LENGTH * 3)

#define LINE_SAMPLE_WIDTH (int)(AUDIO_FREQUENCY / 15750)
#define LINE_PICTURE_WIDTH (LINE_SAMPLE_WIDTH - (int)(LINE_SAMPLE_WIDTH * 0.165))
#define SAMPLES_PER_PIXEL (LINE_PICTURE_WIDTH / FRAME_WIDTH)
#define PIXELS_PER_SAMPLE (1 / SAMPLES_PER_PIXEL)
#define WHITE_LEVEL 0x8FFFFFFF
#define BLACK_LEVEL (int)(WHITE_LEVEL * 0.25)
#define SYNC_LEVEL 0
#define SYNC_THRESHOLD ((BLACK_LEVEL - COLOR_BURST_RANGE) - 16)
#define LUMA_RANGE (WHITE_LEVEL - BLACK_LEVEL)
#define CHROMA_RANGE (LUMA_RANGE / 2)

#define CYCLES_IN_BURST 8
#define COLOR_BURST_RANGE ((int)((BLACK_LEVEL - SYNC_LEVEL) * 0.9) / 2)
#define BACK_PORCH_LENGTH (int)(LINE_SAMPLE_WIDTH * 0.02)
#define SYNC_PULSE_LENGTH (int)(LINE_SAMPLE_WIDTH * 0.075)
#define FRONT_PORCH_PRE (int)(LINE_SAMPLE_WIDTH * 0.006)
#define COLOR_BURST_LENGTH (((int)(LINE_SAMPLE_WIDTH * 0.044) / 2) * 2)
#define FRONT_PORCH_POST (int)(LINE_SAMPLE_WIDTH * 0.02)
#define BYTES_PER_CYCLE ((double)(COLOR_BURST_LENGTH / CYCLES_IN_BURST) / 2)

#define VERTICLE_SYNC_LENGTH (3 + 3 + 3)
#define VERTICLE_BLANK_LINES 33
#define VERTICLE_BLANKING_LINES (VERTICLE_SYNC_LENGTH + VERTICLE_BLANK_LINES)
#define VERTICLE_BLANKING_SAMPLES (LINE_SAMPLE_WIDTH * VERTICLE_BLANKING_LINES)
#define VERTICLE_SYNC_LONG_LENGTH (int)(LINE_SAMPLE_WIDTH * 0.46)
#define VERTICLE_SYNC_SHORT_LENGTH (int)(LINE_SAMPLE_WIDTH * 0.04)
#define TOTAL_RASTER_HEIGHT (FRAME_HEIGHT + VERTICLE_BLANKING_LINES)

#define PI 3.14159
#define TAO (PI *2)
#define DEG_90 (PI / 2)
#define DEG_180 PI
#define DEG_270 DEG_90 + DEG_180
#define DEG_33 (33 * 180 / PI)

unsigned int *encode(unsigned char *image) {
    unsigned int *bytes = new unsigned int[AUDIO_FREQUENCY / 60];
    int i = 0; // where in the output we are
    int p = 0; // where in the input we are
    bool oddLine = false;
    for (int y = 0; y < TOTAL_RASTER_HEIGHT; y++) {
        if (y < FRAME_HEIGHT || y > (FRAME_HEIGHT + VERTICLE_SYNC_LENGTH)) {
            for (int _ = 0; _ < BACK_PORCH_LENGTH; _++) bytes[i++] = BLACK_LEVEL;
            for (int _ = 0; _ < SYNC_PULSE_LENGTH; _++) bytes[i++] = SYNC_LEVEL;
            for (int _ = 0; _ < FRONT_PORCH_PRE; _++) bytes[i++] = BLACK_LEVEL;
            if (oddLine)
                for (int j = 0; j < COLOR_BURST_LENGTH; j++) bytes[i++] = BLACK_LEVEL + (std::sin(((i / BYTES_PER_CYCLE) * PI) + DEG_180) * COLOR_BURST_RANGE);
            else
                for (int j = 0; j < COLOR_BURST_LENGTH; j++) bytes[i++] = BLACK_LEVEL + (std::sin((i / BYTES_PER_CYCLE) * PI) * COLOR_BURST_RANGE);
            for (int _ = 0; _ < FRONT_PORCH_POST; _++) bytes[i++] = BLACK_LEVEL;
            if (y < FRAME_HEIGHT) {
                for (int x = 0; x < FRAME_WIDTH; x++) {
                    // this is some, rather renamed, variables for the YIQ color space (l = Y, j = I, q = Q).
                    // see https://en.wikipedia.org/wiki/YIQ for what little information was left available.
                    // it seems that the peeps who defined this standard were kinda just shit
                    // and so never defined where most of these magic numbers come from;
                    // except for luma, which is stolen from PAL's YUV color space.

                    // minor note: all numbers here are 0-255 ranged, not 0-1 ranged
                    // this is just because RGB is 0-255, and its cheaper to leak that in and deal with it later
                    // then to convert RGB to 0-1 here and now
                    float l = (image[p +0] * 0.30) + (image[p +1] * 0.59) + (image[p +2] * 0.11);
                    float j = (-0.27 * (image[p +2] - l)) + (0.47 * (image[p +0] - l));
                    float q = (0.41 * (image[p +2] - l)) + (0.48 * (image[p +0] - l));
                    for (int _ = 0; _ < SAMPLES_PER_PIXEL; _++) {
                        // chroma signal
                        float s;
                        // I and Q are encoded as a plane vector, rotated 33 degrees counter-clockwise
                        // nobody says this though??? its very confusing, only reference i have is the doc linked at the top
                        // in short, I is Y and Q is X, 
                        if (oddLine)
                            s = (std::sin(((i / BYTES_PER_CYCLE) * PI) + DEG_33) * q) + (std::cos(((i / BYTES_PER_CYCLE) * PI) + DEG_33) * j);
                        else
                            s = (std::sin(((i / BYTES_PER_CYCLE) * PI) + DEG_33 + DEG_180) * q) + (std::cos(((i / BYTES_PER_CYCLE) * PI) + DEG_33 + DEG_180) * j);
                        bytes[i++] = ((l / 255) * LUMA_RANGE) + ((s / 255) * CHROMA_RANGE) + BLACK_LEVEL;
                    }
                    p += 3;
                }
            } else {
                for (int _ = 0; _ < LINE_PICTURE_WIDTH; _++) bytes[i++] = BLACK_LEVEL;
            }
        } else {
            switch (y - FRAME_HEIGHT) {
            case 8:
            case 7:
            case 6:
            case 2:
            case 1:
            case 0:
                for (int _ = 0; _ < VERTICLE_SYNC_SHORT_LENGTH; _++) bytes[i++] = SYNC_LEVEL;
                for (int _ = 0; _ < VERTICLE_SYNC_LONG_LENGTH; _++) bytes[i++] = BLACK_LEVEL;
                for (int _ = 0; _ < VERTICLE_SYNC_SHORT_LENGTH; _++) bytes[i++] = SYNC_LEVEL;
                for (int _ = 0; _ < VERTICLE_SYNC_LONG_LENGTH; _++) bytes[i++] = BLACK_LEVEL;
                break;
            case 5:
            case 4:
            case 3:
                for (int _ = 0; _ < VERTICLE_SYNC_LONG_LENGTH; _++) bytes[i++] = SYNC_LEVEL;
                for (int _ = 0; _ < VERTICLE_SYNC_SHORT_LENGTH; _++) bytes[i++] = BLACK_LEVEL;
                for (int _ = 0; _ < VERTICLE_SYNC_LONG_LENGTH; _++) bytes[i++] = SYNC_LEVEL;
                for (int _ = 0; _ < VERTICLE_SYNC_SHORT_LENGTH; _++) bytes[i++] = BLACK_LEVEL;
                break;
            }
        }
        oddLine = !oddLine;
    }
    return bytes;
}

char *decode(unsigned int *samples, int *idx) {
    char *image = new char[FRAME_WIDTH * FRAME_HEIGHT * 3];
    unsigned int line[LINE_PICTURE_WIDTH];
    int p = 0;
    int i = *idx;
    bool wasSyncSig = false;
    bool isSyncSig = false;
    bool resetWait = false;
    unsigned int blackLevel;
    // collector and length, for averages
    unsigned int c = 0,
        l = 0;
    bool oddLine = false;
    for (int y = 0; y < TOTAL_RASTER_HEIGHT; y++) {
        oddLine = !oddLine;
        // we do not nor ever will care about any data contained within those fields, so toss them directly out the window
        if (resetWait) { i += LINE_SAMPLE_WIDTH; continue; }
        bool doubleSync = false;
        if (y < FRAME_HEIGHT)
            while (samples[i++] > SYNC_THRESHOLD) {} // skip back porch
        while (samples[i++] < SYNC_THRESHOLD) {} // skip sync sig
        c = 0;
        l = 0;
        for (int _ = 0; _ < FRONT_PORCH_PRE; _++) { c += samples[i++]; l++; }
        float rootPhase = atan2(samples[i +0] - samples[i +2], samples[i +1] - samples[i +3]);
        int burstPos = i;
        for (int _ = 0; _ < COLOR_BURST_LENGTH; _++) { c += samples[i++]; l++; }
        for (int _ = 0; _ < FRONT_PORCH_POST; _++) { c += samples[i++]; l++; }
        blackLevel = c / l;

        int j = 0;
        int start = i;
        for (int x = 0; x < FRAME_WIDTH; x++) {
            for (int _ = 0; _ < SAMPLES_PER_PIXEL; _++) {
                if (samples[i] < SYNC_THRESHOLD) doubleSync = true;
                if (y < FRAME_HEIGHT) {
                    int align = (((i - burstPos) / 5) * 5) + burstPos;
                    int alignPrev = align - start;
                    unsigned int v0 = (samples[align +0] + line[alignPrev +0]) / 2;
                    unsigned int v1 = (samples[align +1] + line[alignPrev +1]) / 2;
                    unsigned int v2 = (samples[align +2] + line[alignPrev +2]) / 2;
                    unsigned int v3 = (samples[align +3] + line[alignPrev +3]) / 2;
                    float luma = (double)(((samples[i] + line[j]) / 2) - blackLevel) / (WHITE_LEVEL * 1.33);
                    float s0 = (double)(samples[align +0] - v0) / (WHITE_LEVEL * 1.33);
                    float s1 = (double)(samples[align +1] - v1) / (WHITE_LEVEL * 1.33);
                    float s2 = (double)(samples[align +2] - v2) / (WHITE_LEVEL * 1.33);
                    float s3 = (double)(samples[align +3] - v3) / (WHITE_LEVEL * 1.33);
                    float h = std::atan2(s0 - s2, s1 - s3) - rootPhase;
                    float s = 0;
                    if (s0 > s) s = s0;
                    if (s1 > s) s = s1;
                    if (s2 > s) s = s2;
                    if (s3 > s) s = s3;
                    float k = std::cos(h) * s;
                    float q = std::sin(h) * s;
                    // std::cout << "x:" << x << " y:" << y << " s0:" << s0 << " s1:" << s1 << " s2:" << s2 << " s3:" << s3 << " s:" << s << " y:" << luma << " " << ((samples[i] + line[j]) / 2) << " i:" << k << " q:" << q << "\n";
                    image[p +0] = (luma + (0.9469 * k) + (0.6236 * q)) * 255;
                    image[p +1] = (luma - (0.2748 * k) - (0.6357 * q)) * 255;
                    image[p +2] = (luma - (1.1 * k) - (1.7 * q)) * 255;
                }
                line[j] = samples[i];
                i++;
                j++;
            }
            p += 3;
        }    
        
        wasSyncSig = isSyncSig;
        isSyncSig = doubleSync;
        if (wasSyncSig && !isSyncSig) {
            resetWait = true;
            if (y < FRAME_HEIGHT) // jump y register to where the frame actually is
                y = FRAME_HEIGHT + VERTICLE_SYNC_LENGTH;
        }
    }

    *idx = i;
    return image;
}