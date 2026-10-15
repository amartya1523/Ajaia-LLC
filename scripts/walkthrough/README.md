# Walkthrough video pipeline

Records the walkthrough as a scripted end-to-end run, timed to narration.

1. `node tts.cjs`: generates one narration clip per scene from `scenes.json` (`ENGINE=eleven XI_KEY=...` for ElevenLabs, `ENGINE=say` for the macOS system voice) and writes durations.
2. Start a fresh server: `PORT=4100 DB_PATH=/tmp/rec.db npm start`
3. `node record.cjs`: Playwright drives the real app (Alice, Bob, Carol), holding each scene for its narration length.
4. `node assemble.cjs`: ffmpeg places each clip at its scene start and encodes the MP4.

Dependencies (install separately, not part of the app): `playwright`, `ffmpeg-static`, `ffprobe-static`.
