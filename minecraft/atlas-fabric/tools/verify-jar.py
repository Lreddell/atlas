"""Inspect the actual remapped artifact; dev-classpath success cannot prove this."""
import hashlib,json,sys
from pathlib import Path
from zipfile import ZipFile
p=Path(sys.argv[1])
with ZipFile(p) as z:
    meta=json.loads(z.read('fabric.mod.json'))
    for entry in meta['mixins']:
        config=json.loads(z.read(entry if isinstance(entry,str) else entry['config']))
        mapping=json.loads(z.read(config['refmap']))['mappings']
        for mixin in config.get('mixins',[])+config.get('client',[]):
            name=config['package'].replace('.','/')+'/'+mixin
            assert name in mapping, f'{name} missing from {config["refmap"]}'
            assert int.from_bytes(z.read(name+'.class')[6:8],'big')==65
    nested={x['file'] for x in meta['jars']}
    assert any('fabric-api-' in x for x in nested)
    assert any('rhino-' in x for x in nested)
    audio=json.loads(z.read('assets/atlas/audio-provenance.json'))
    assert len(audio)==23
    for track in audio:
        assert hashlib.sha256(z.read('assets/atlas/sounds/'+track['target'])).hexdigest()==track['sha256']
print(f'Production JAR verified: {p.name}; client/common refmaps, Java 21, nested dependencies, 23 music checksums.')
