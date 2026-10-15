// Usage: ENGINE=eleven XI_KEY=... node tts.cjs   |   ENGINE=say node tts.cjs
const fs = require('fs');
const { execFileSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const ffprobe = require('ffprobe-static').path;
const scenes = JSON.parse(fs.readFileSync('scenes.json', 'utf8'));
const ENGINE = process.env.ENGINE || 'eleven';
const DIR = `audio_${ENGINE}`;
const VOICE = process.env.VOICE || (ENGINE === 'eleven' ? 'nPczCjzI2devNBz1zQrb' : 'Daniel');
fs.mkdirSync(DIR, { recursive: true });

async function eleven(s, i, file) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.XI_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: s.text, model_id: 'eleven_multilingual_v2',
      previous_text: scenes[i - 1]?.text, next_text: scenes[i + 1]?.text,
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true },
    }),
  });
  if (!res.ok) throw new Error(`${s.id}: ${res.status} ${await res.text()}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

function say(s, file) {
  const aiff = file.replace('.mp3', '.aiff');
  execFileSync('say', ['-v', VOICE, '-r', '178', '-o', aiff, s.text]);
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', aiff, '-ar', '44100', '-ac', '1', '-b:a', '128k', file]);
  fs.unlinkSync(aiff);
}

(async () => {
  const durations = {};
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const file = `${DIR}/${s.id}.mp3`;
    if (!fs.existsSync(file)) ENGINE === 'eleven' ? await eleven(s, i, file) : say(s, file);
    durations[s.id] = parseFloat(execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString());
    console.log(s.id, durations[s.id].toFixed(2));
  }
  fs.writeFileSync(`${DIR}/durations.json`, JSON.stringify(durations, null, 1));
  console.log('total', Object.values(durations).reduce((a, b) => a + b, 0).toFixed(1));
})().catch((e) => { console.error(e.message); process.exit(1); });
