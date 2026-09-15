"""Generate the licensed ElevenLabs sound library, then peak-normalize PCM to -6 dBFS.

Requires ELEVENLABS_API_KEY (environment or nearest .env), ffmpeg. Never logs keys.
Existing finished files are reused unless --force is passed. Manifest updated only after success.
"""
import argparse, json, math, os, pathlib, shutil, struct, subprocess, urllib.request, urllib.error, wave

ROOT = pathlib.Path(__file__).resolve().parents[1]
PROMPTS = {
 'chains_soft': (1.6, 'Single soft disc golf putter caught in steel basket chains, delicate bright link rattle then plastic settles, clean isolated game sound, no voice or music.'),
 'chains_medium': (1.8, 'Single disc golf disc firmly hitting steel basket chains, satisfying metallic cascade then tray clatter, clean isolated game sound, no music.'),
 'chains_fast': (1.8, 'Fast powerful disc strikes disc golf basket steel chains, loud sharp metallic crash and short scattering rattle, clean isolated game sound.'),
 'band': (1.0, 'Single plastic disc hits the solid top metal band of a disc golf basket, bright hollow clang, short isolated tail.'),
 'tray': (1.1, 'Plastic disc drops into metal wire basket tray, hollow clunk and two light rattling bounces, isolated.'),
 'tree': (0.8, 'Plastic flying disc thwacks a solid tree trunk, rounded woody knock and tiny leaf rustle, isolated game effect.'),
 'grass': (0.9, 'Plastic disc landing and sliding gently through short grass, soft thud and dry swish, isolated game effect.'),
 'splash': (1.4, 'Flying disc splashes into a pond, cheerful clear small water splash, droplets and short ripple tail, isolated.'),
 'whoosh': (0.7, 'Quick clean airy whoosh as a flying disc is thrown, energetic family sports video game, isolated.'),
 'applause': (3.0, 'Small unseen outdoor golf gallery applauds a good shot, warm cheerful clapping with a few pleased cheers, no words, no music.'),
 'ohh': (2.4, 'Small outdoor golf gallery reacting to a near miss with a single slow descending disappointed Ohhh, warm playful sympathetic voices, no music.'),
 'birdie_jingle': (2.7, 'Original joyful birdie reward jingle for a sunny family sports game, ascending marimba and bright brass with a final sparkling major chord, short complete cadence, no voice.'),
}

def key():
    value = os.environ.get('ELEVENLABS_API_KEY')
    if value: return value
    for folder in (ROOT, *ROOT.parents):
        for name in ('.env', '.env.local'):
            f = folder / name
            if f.exists():
                for line in f.read_text().splitlines():
                    if line.strip().startswith('ELEVENLABS_API_KEY='):
                        return line.split('=', 1)[1].strip().strip('\"\'')
    return None

def normalize(source, target):
    temp = target.with_suffix('.pcm')
    subprocess.run(['ffmpeg','-v','error','-y','-i',str(source),'-f','s16le','-ac','1','-ar','24000',str(temp)], check=True)
    raw = temp.read_bytes(); samples = struct.unpack('<'+'h'*(len(raw)//2),raw)
    peak = max(abs(x) for x in samples)
    if not peak: raise RuntimeError('silent generated sample')
    gain = (32767 * 10**(-6/20))/peak
    pcm=struct.pack('<'+'h'*len(samples),*(round(x*gain) for x in samples))
    with wave.open(str(target),'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(24000); w.writeframes(pcm)
    temp.unlink()
    return {'peakDbFS': round(20*math.log10(max(abs(x) for x in struct.unpack('<'+'h'*(len(pcm)//2),pcm))/32767),3), 'bytes': target.stat().st_size}

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--force',action='store_true'); parser.add_argument('--dry-run',action='store_true'); args=parser.parse_args()
    if args.dry_run: print(json.dumps(PROMPTS,indent=2)); return
    token=key()
    if not token: raise SystemExit('BLOCKED: ELEVENLABS_API_KEY unavailable; no recordings generated or manifest entries fabricated.')
    if not shutil.which('ffmpeg'): raise SystemExit('ffmpeg required')
    folder=ROOT/'assets/sfx'; folder.mkdir(exist_ok=True)
    source_dir=ROOT/'art/sfx'; source_dir.mkdir(exist_ok=True)
    report={}
    for name,(duration,prompt) in PROMPTS.items():
        target=folder/(name+'.wav'); source=source_dir/(name+'.mp3')
        if not target.exists() or args.force:
            request=urllib.request.Request('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128',data=json.dumps({'text':prompt,'duration_seconds':duration,'prompt_influence':0.45}).encode(),headers={'xi-api-key':token,'Content-Type':'application/json'})
            try:
                with urllib.request.urlopen(request,timeout=120) as response: source.write_bytes(response.read())
            except urllib.error.HTTPError as error: raise SystemExit(f'ElevenLabs HTTP {error.code}; partial generated files retained for resume.')
            report[name]=normalize(source,target)
        else: report[name]={'bytes':target.stat().st_size,'reused':True}
    manifest_path=ROOT/'assets/manifest.json'; manifest=json.loads(manifest_path.read_text()); manifest['sfx'].update({n:'sfx/'+n+'.wav' for n in PROMPTS}); manifest_path.write_text(json.dumps(manifest,indent=2)+'\n')
    (ROOT/'docs/qa/sfx-generation.json').write_text(json.dumps({'provider':'ElevenLabs sound-effects API','targetPeakDbFS':-6,'samples':report,'prompts':PROMPTS},indent=2)+'\n')
    print('Generated and normalized',len(report),'recordings; manifest updated.')

if __name__=='__main__': main()
