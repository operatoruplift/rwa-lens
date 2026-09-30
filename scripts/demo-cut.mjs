/** Make a short, complete-sentence edit from the reviewed narrated master.
 * Usage: node scripts/demo-cut.mjs <cuts.json> <output.mp4>
 * cuts: { video, scenes: [{ from, duration }] }. Audio is never sped up.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

const [editPath, outputPath] = process.argv.slice(2);
if (!editPath || !outputPath) throw new Error('Provide cuts.json and output.mp4.');
const file = resolve(editPath);
const edit = JSON.parse(readFileSync(file, 'utf8'));
const input = resolve(dirname(file), edit.video);
const output = resolve(outputPath);
const run = (tool, args) => execFileSync(tool, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const probe = path => JSON.parse(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height', '-of', 'json', path]));
const info = probe(input);
const duration = Number(info.format.duration);
if (!Number.isFinite(duration) || duration <= 0) throw new Error('Source duration must be finite and positive.');
if (!info.streams.some(stream => stream.codec_type === 'audio')) throw new Error('Source must contain the completed narration.');
if (!Array.isArray(edit.scenes) || !edit.scenes.length || edit.scenes.some(scene => !Number.isFinite(scene.from) || scene.from < 0 || !Number.isFinite(scene.duration) || scene.duration <= 0 || scene.from + scene.duration > duration + 0.02)) throw new Error('Every cut must fit inside the source video.');

const filters = edit.scenes.flatMap((scene, i) => [
  `[0:v]trim=start=${scene.from}:duration=${scene.duration},setpts=PTS-STARTPTS[v${i}]`,
  `[0:a]atrim=start=${scene.from}:duration=${scene.duration},asetpts=PTS-STARTPTS[a${i}]`,
]);
filters.push(edit.scenes.map((_, i) => `[v${i}][a${i}]`).join('') + `concat=n=${edit.scenes.length}:v=1:a=1[v][voice]`);
filters.push('[voice]loudnorm=I=-16:TP=-1.5:LRA=11[a]');
const targetDuration = edit.scenes.reduce((sum, scene) => sum + scene.duration, 0);
mkdirSync(dirname(output), { recursive: true });
run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', input, '-filter_complex', filters.join(';'), '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', '-y', output]);
const result = probe(output);
if (Math.abs(Number(result.format.duration) - targetDuration) > 0.12) throw new Error('Short edit duration does not match its reviewed cuts.');
writeFileSync(`${output}.json`, JSON.stringify({ input, scenes: edit.scenes, targetDuration, result }, null, 2) + '\n');
console.log(`Rendered ${targetDuration.toFixed(2)}s overview: ${output}`);
