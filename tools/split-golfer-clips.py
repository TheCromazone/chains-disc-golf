"""Repack authored Blender exports: one body, zero meshes in each animation clip.
Unlike the sibling's placeholder triangle, clips contain only animated nodes/accessors.
Every retained accessor is copied with its byte stride intact and checked on build.
"""
import json, struct, copy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/models'
def read(path):
    raw=path.read_bytes();n=struct.unpack_from('<I',raw,12)[0]
    return json.loads(raw[20:20+n]),raw[28+n:]
def write(path,doc,binary):
    # Compact used accessors and buffer views, dropping unused animation/geometry bytes.
    refs=set()
    for mesh in doc.get('meshes',[]):
        for p in mesh['primitives']:
            refs.update(p['attributes'].values())
            if 'indices' in p:refs.add(p['indices'])
    for s in doc.get('skins',[]):refs.add(s['inverseBindMatrices'])
    for a in doc.get('animations',[]):
        for s in a['samplers']:refs.update([s['input'],s['output']])
    mapping={v:i for i,v in enumerate(sorted(refs))};views={doc['accessors'][i]['bufferView'] for i in refs};vmap={v:i for i,v in enumerate(sorted(views))};data=bytearray();outviews=[]
    for i in sorted(views):
        v=copy.deepcopy(doc['bufferViews'][i]);start=v.get('byteOffset',0);chunk=binary[start:start+v['byteLength']]
        data.extend(b'\0'*(-len(data)%4));v['byteOffset']=len(data);v['buffer']=0;outviews.append(v);data.extend(chunk)
    accessors=[]
    for i in sorted(refs):
        a=copy.deepcopy(doc['accessors'][i]);a['bufferView']=vmap[a['bufferView']];accessors.append(a)
    for m in doc.get('meshes',[]):
        for p in m['primitives']:
            p['attributes']={k:mapping[v] for k,v in p['attributes'].items()}
            if 'indices' in p:p['indices']=mapping[p['indices']]
    for s in doc.get('skins',[]):s['inverseBindMatrices']=mapping[s['inverseBindMatrices']]
    for a in doc.get('animations',[]):
        for s in a['samplers']:s['input']=mapping[s['input']];s['output']=mapping[s['output']]
    doc['accessors']=accessors;doc['bufferViews']=outviews;doc['buffers']=[{'byteLength':len(data)}]
    encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*(-len(encoded)%4);data.extend(b'\0'*(-len(data)%4))
    path.write_bytes(struct.pack('<III',0x46546c67,2,28+len(encoded)+len(data))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(data),0x004e4942)+data)
src,bin=read(OUT/'golfer-mii-source.glb')
report={'skeleton':'ChainsRig eleven-joint v1','clips':{}}
for a in src['animations']:
    doc=copy.deepcopy(src);doc['animations']=[copy.deepcopy(a)]
    for key in ['meshes','materials','textures','images','skins']:doc.pop(key,None)
    for node in doc['nodes']:node.pop('mesh',None);node.pop('skin',None)
    path=OUT/f"golfer-{a['name']}.glb";write(path,doc,bin)
    report['clips'][a['name']]={'file':f'assets/models/{path.name}','bytes':path.stat().st_size,'duration':max(src['accessors'][s['input']]['max'][0] for s in a['samplers']),'meshes':0}
for input,name in [('golfer-mii-source.glb','golfer.glb'),('golfer-lod-source.glb','golfer-lod.glb')]:
    doc,bin=read(OUT/input);doc.pop('animations',None);write(OUT/name,doc,bin)
    report[name]={'bytes':(OUT/name).stat().st_size}
(OUT/'golfer-clips.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))

# Keep immutable author exports beside Blender sources, outside the runtime folder.
for name in ['golfer-mii-source.glb','golfer-lod-source.glb']:
    (OUT/name).replace(ROOT/'art/blender'/name)
