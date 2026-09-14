"""Convert embedded PNGs to KTX2 while preserving Blender's Draco data."""
import json, pathlib, struct, subprocess, sys
root = pathlib.Path(__file__).resolve().parents[1]
toktx = sys.argv[1] if len(sys.argv)>1 else r'C:/Users/matth/.codex/tools/ktx/bin/toktx.exe'
temp = root/'art/processed'; temp.mkdir(parents=True, exist_ok=True)
for path in (root/'assets/models').glob('*.glb'):
    raw=path.read_bytes(); jl=struct.unpack_from('<I',raw,12)[0]
    doc=json.loads(raw[20:20+jl]); binary=raw[28+jl:]
    if not doc.get('images') or 'KHR_texture_basisu' in doc.get('extensionsUsed',[]): continue
    srgb=set()
    for m in doc.get('materials',[]):
        for t in [m.get('pbrMetallicRoughness',{}).get('baseColorTexture'),m.get('emissiveTexture')]:
            if t: srgb.add(doc['textures'][t['index']]['source'])
    replacements={}
    for i,im in enumerate(doc['images']):
        vi=im['bufferView']; v=doc['bufferViews'][vi]; start=v.get('byteOffset',0)
        png=temp/f'{path.stem}-{i}.png'; png.write_bytes(binary[start:start+v['byteLength']])
        ktx=png.with_suffix('.ktx2')
        subprocess.run([toktx,'--t2','--encode','uastc','--genmipmap','--assign_oetf','srgb' if i in srgb else 'linear','--zcmp','18','--threads','4',str(ktx),str(png)],check=True)
        replacements[vi]=ktx.read_bytes(); im['mimeType']='image/ktx2'
    data=bytearray()
    for i,v in enumerate(doc['bufferViews']):
        start=v.get('byteOffset',0); chunk=replacements.get(i,binary[start:start+v['byteLength']])
        data.extend(b'\0'*((-len(data))%4)); v['byteOffset']=len(data); v['byteLength']=len(chunk); data.extend(chunk)
    for t in doc.get('textures',[]):
        t.setdefault('extensions',{})['KHR_texture_basisu']={'source':t.pop('source')}
    for key in ['extensionsUsed','extensionsRequired']: doc.setdefault(key,[]).append('KHR_texture_basisu')
    doc['buffers'][0]['byteLength']=len(data); data.extend(b'\0'*((-len(data))%4))
    js=json.dumps(doc,separators=(',',':')).encode(); js+=b' '*((-len(js))%4)
    path.write_bytes(struct.pack('<III',0x46546c67,2,28+len(js)+len(data))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(data),0x004e4942)+data)
    print(path.name,len(raw),'->',path.stat().st_size)
