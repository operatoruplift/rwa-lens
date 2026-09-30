/** Assemble real recorded app footage into a shareable clean master.
 * Usage: node scripts/demo-render.mjs <edit.json> <output.mp4>
 * edit: { video, narration?, scenes: [{ video?, from, sourceDuration, duration }] }
 * Source times come from reviewed footage; target times follow measured audio.
 */
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

const [editPath, outputPath] = process.argv.slice(2);
if (!editPath || !outputPath) throw new Error('Provide edit.json and output.mp4.');
const editFile = resolve(editPath);
const edit = JSON.parse(await readFile(editFile, 'utf8'));
const input = resolve(dirname(editFile), edit.video);
const narration = edit.narration ? resolve(dirname(editFile), edit.narration) : null;
const output = resolve(outputPath);
const validTime = value => Number.isFinite(value) && value >= 0;
if (!Array.isArray(edit.scenes) || !edit.scenes.length || edit.scenes.some(scene => !validTime(scene.from) || !validTime(scene.sourceDuration) || scene.sourceDuration <= 0 || !validTime(scene.duration) || scene.duration <= 0)) throw new Error('Edit scenes need valid nonnegative times and positive durations.');

function run(command, args) {
  return new Promise((ok, fail) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', bytes => { stdout += bytes; });
    child.stderr.on('data', bytes => { stderr = (stderr + bytes).slice(-12000); });
    child.on('error', fail);
    child.on('close', code => code === 0 ? ok(stdout) : fail(new Error(`${command} exited ${code}: ${stderr}`)));
  });
}
const probe = file => run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height,sample_rate', '-of', 'json', file]).then(JSON.parse);
const sceneInputs = edit.scenes.map(scene => scene.video ? resolve(dirname(editFile), scene.video) : input);
const sourceDurations = new Map();
for (const source of new Set(sceneInputs)) {
  const sourceDuration = Number((await probe(source)).format.duration);
  if (!Number.isFinite(sourceDuration) || sourceDuration <= 0) throw new Error('Recorded footage must have a finite positive duration.');
  sourceDurations.set(source, sourceDuration);
}
if (edit.scenes.some((scene, index) => scene.from + scene.sourceDuration > sourceDurations.get(sceneInputs[index]) + 0.05)) throw new Error('A cut extends past the recorded footage.');
const targetDuration = edit.scenes.reduce((sum, scene) => sum + scene.duration, 0);
if (narration) {
  const audioInfo = await probe(narration);
  if (!audioInfo.streams.some(stream => stream.codec_type === 'audio')) throw new Error('Narration input contains no audio stream.');
  if (targetDuration < Number(audioInfo.format.duration) + 0.15) throw new Error('Video must preserve the full narration and at least 150ms of tail.');
}
await mkdir(dirname(output), { recursive: true });
const work = await mkdtemp(join(tmpdir(), 'rwa-demo-'));
try {
  const names = [];
  for (const [index, scene] of edit.scenes.entries()) {
    const name = `scene-${String(index + 1).padStart(2, '0')}.mp4`;
    names.push(name);
    // Keep UI interactions at their recorded speed. Hold the last real frame if
    // narration needs more time; never synthesize a result or motion between states.
    // A 60px border above/below the picture keeps captions off app controls.
    const filters = `scale=1728:960:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x101211,setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=${scene.duration},trim=duration=${scene.duration},setpts=PTS-STARTPTS`;
    await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-ss', String(scene.from), '-t', String(scene.sourceDuration), '-i', sceneInputs[index], '-vf', filters, '-an', '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-y', join(work, name)]);
  }
  await writeFile(join(work, 'cuts.txt'), names.map(name => `file '${name}'`).join('\n') + '\n');
  const args = ['-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '1', '-i', join(work, 'cuts.txt')];
  if (narration) args.push('-i', narration, '-map', '0:v:0', '-map', '1:a:0', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11,apad', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000');
  else args.push('-an');
  args.push('-c:v', 'copy', '-t', String(targetDuration), '-movflags', '+faststart', '-y', output);
  await run('ffmpeg', args);
  const result = await probe(output);
  if (Math.abs(Number(result.format.duration) - targetDuration) > 0.12) throw new Error('Rendered duration does not match the reviewed edit.');
  await writeFile(`${output}.json`, JSON.stringify({ input, narration, targetDuration, scenes: edit.scenes, result }, null, 2) + '\n');
  console.log(`Rendered ${targetDuration.toFixed(2)}s at 1920×1080: ${output}`);
} finally { await rm(work, { recursive: true, force: true }); }
