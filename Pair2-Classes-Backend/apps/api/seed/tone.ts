/** A short sine-tone WAV, used for seed placeholder audio and tests. */
export function toneWav(frequency = 440, ms = 600, sampleRate = 16000): Buffer {
  const samples = Math.floor((sampleRate * ms) / 1000);
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    // Short fade in and out so the clip doesn't click.
    const fade = Math.min(1, i / 400, (samples - i) / 400);
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * frequency * i) / sampleRate) * 0.3 * fade * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
