// Simple Node script to generate custom alarm sounds as WAV PCM 16-bit mono 44.1kHz
// Run: node scripts/generateAlarmSound.js
// Outputs:
//   - assets/sounds/alarm_android.wav (long ~60s)
//   - assets/sounds/alarm_ios.wav (short <=29s)
// You can customize frequency, duration or pattern below.

const fs = require('fs');
const path = require('path');

const sampleRate = 44100; // Hz
const freq = 880; // beep frequency in Hz
const beepDurationSec = 0.5; // each beep duration
const silenceSec = 0.2; // gap between beeps

function buildPattern(totalSeconds) {
  const patternSamples = Math.floor(totalSeconds * sampleRate);
  const out = new Int16Array(patternSamples);
  let w = 0;
  while (w < patternSamples) {
    const beepSamples = Math.min(Math.floor(beepDurationSec * sampleRate), patternSamples - w);
    for (let i = 0; i < beepSamples && w < patternSamples; i++) {
      const t = i / sampleRate;
      const env = Math.min(1, Math.min(i / (0.02 * sampleRate), (beepSamples - i) / (0.02 * sampleRate)));
      const value = Math.sin(2 * Math.PI * freq * t) * 0.6 * env;
      out[w++] = Math.max(-1, Math.min(1, value)) * 0x7FFF;
    }
    const silenceSamples = Math.min(Math.floor(silenceSec * sampleRate), patternSamples - w);
    for (let i = 0; i < silenceSamples && w < patternSamples; i++) out[w++] = 0;
  }
  return out;
}

// WAV header construction
function createWavBuffer(int16Samples, sampleRate) {
  const numChannels = 1;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = int16Samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);
  let offset = 0;
  function writeString(s) { buffer.write(s, offset); offset += s.length; }
  function writeUInt32LE(v) { buffer.writeUInt32LE(v, offset); offset += 4; }
  function writeUInt16LE(v) { buffer.writeUInt16LE(v, offset); offset += 2; }

  writeString('RIFF');
  writeUInt32LE(36 + dataSize); // file size - 8
  writeString('WAVE');
  writeString('fmt ');
  writeUInt32LE(16); // PCM chunk size
  writeUInt16LE(1); // audio format PCM
  writeUInt16LE(numChannels);
  writeUInt32LE(sampleRate);
  writeUInt32LE(byteRate);
  writeUInt16LE(blockAlign);
  writeUInt16LE(bitsPerSample = 16);
  writeString('data');
  writeUInt32LE(dataSize);
  // Write samples
  for (let i = 0; i < int16Samples.length; i++) {
    buffer.writeInt16LE(int16Samples[i], offset); offset += 2;
  }
  return buffer;
}

const androidSamples = buildPattern(60);   // ~60s for Android
const iosSamples = buildPattern(29);       // <=29s for iOS limit
const wavAndroid = createWavBuffer(androidSamples, sampleRate);
const wavIos = createWavBuffer(iosSamples, sampleRate);
const outDir = path.join(__dirname, '..', 'assets', 'sounds');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const outAndroid = path.join(outDir, 'alarm_android.wav');
const outIos = path.join(outDir, 'alarm_ios.wav');
fs.writeFileSync(outAndroid, wavAndroid);
fs.writeFileSync(outIos, wavIos);
console.log('Generated', outAndroid, 'size', wavAndroid.length, 'bytes');
console.log('Generated', outIos, 'size', wavIos.length, 'bytes');
