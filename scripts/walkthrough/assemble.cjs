// Usage: ENGINE=say OUT=/path/out.mp4 node assemble.cjs
const fs = require('fs');
const { execFileSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const ENGINE = process.env.ENGINE || 'say';
const OUT = process.env.OUT || `walkthrough_${ENGINE}.mp4`;
const { marks, video, total } = JSON.parse(fs.readFileSync(`marks_${ENGINE}.json`, 'utf8'));
const args = ['-y', '-loglevel', 'error', '-i', video];
marks.forEach((m) => args.push('-i', `audio_${ENGINE}/${m.id}.mp3`));
const delays = marks.map((m, i) => {
  const ms = Math.round(m.start * 1000) + 150;
  return `[${i + 1}:a]aformat=sample_rates=44100:channel_layouts=stereo,adelay=${ms}|${ms}[a${i}]`;
});
const mix = `${marks.map((_, i) => `[a${i}]`).join('')}amix=inputs=${marks.length}:normalize=0:dropout_transition=0,loudnorm=I=-16:TP=-1.5[aout]`;
const fadeOut = (total - 1.2).toFixed(2);
const vf = `[0:v]fps=30,fade=t=in:st=0:d=0.6,fade=t=out:st=${fadeOut}:d=1.2,format=yuv420p[vout]`;
args.push('-filter_complex', [...delays, mix, vf].join(';'), '-map', '[vout]', '-map', '[aout]',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-c:a', 'aac', '-b:a', '160k',
  '-t', total.toFixed(2), '-movflags', '+faststart', OUT);
execFileSync(ffmpeg, args, { stdio: 'inherit' });
console.log('wrote', OUT);
