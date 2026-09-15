from PIL import Image,ImageDraw
from pathlib import Path
import json,base64,io
frames=json.loads(Path('docs/qa/r3/animation-frames.json').read_text())
for hand in ['right','left']:
 rows=[x for x in frames if x['hand']==hand];out=Image.new('RGB',(860,10*388),(217,240,235));d=ImageDraw.Draw(out)
 for i,x in enumerate(rows):
  tile=Image.open(io.BytesIO(base64.b64decode(x['image']))).resize((215,363));col=i%4;row=i//4;out.paste(tile,(col*215,row*388+25));d.text((col*215+8,row*388+7),f"{x['id']} {x['phase']:.2f}",fill=(15,65,61))
 out.save(f'docs/qa/r3/animation-{hand}-filmstrip.jpg',quality=84)
