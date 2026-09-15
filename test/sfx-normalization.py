"""Exercise the actual audio normalizer with a local sine fixture, not a generated recording."""
import importlib.util, math, pathlib, struct, tempfile, wave
path=pathlib.Path(__file__).resolve().parents[1]/'tools/generate-sfx.py'
spec=importlib.util.spec_from_file_location('chains_sfx',path); module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
with tempfile.TemporaryDirectory() as tmp:
    source=pathlib.Path(tmp)/'fixture.wav'; target=pathlib.Path(tmp)/'normalized.wav'
    with wave.open(str(source),'wb') as w:
        w.setnchannels(1);w.setsampwidth(2);w.setframerate(24000);w.writeframes(struct.pack('<'+'h'*24000,*(round(2000*math.sin(i*440*math.tau/24000)) for i in range(24000))))
    report=module.normalize(source,target)
    assert abs(report['peakDbFS']+6)<.002,report
    print('Normalizer sine-fixture verified:',report)
