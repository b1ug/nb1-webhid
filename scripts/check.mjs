import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const dist=path.join(root,'dist');
const manifest=JSON.parse(await fs.readFile(path.join(dist,'build.json'),'utf8'));
for(const file of manifest.files){const bytes=await fs.readFile(path.join(dist,file.path));if(bytes.length!==file.bytes||crypto.createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('Output hash mismatch: '+file.path);}
for(const kind of ['web','extension']){
  const files=manifest.files.filter(f=>f.path.startsWith(kind+'/')&&/\.(html|css|js)$/.test(f.path));
  for(const file of files){
    const value=await fs.readFile(path.join(dist,file.path),'utf8');
    if(file.path.endsWith('.html')){
      if(/B-3|B‑3|B3 light|B3 小灯/.test(value))throw Error('Artwork selection number used in visible HTML: '+file.path);
      if(/<(?:script|link|img)[^>]+(?:src|href)=["']https?:\/\//.test(value))throw Error('External runtime resource: '+file.path);
      for(const match of value.matchAll(/(?:src|href)=["']([^"']+)["']/g)){
        const target=match[1];if(/^(?:https?:|chrome:|#)/.test(target))continue;
        const localPath=target.split(/[?#]/,1)[0];
        const resolved=path.resolve(path.dirname(path.join(dist,file.path)),localPath);
        if(resolved!==path.join(dist,kind)&&!resolved.startsWith(path.join(dist,kind)+path.sep))throw Error('Escaping resource: '+target);
        await fs.access(resolved);
      }
    }
  }
}
console.log(JSON.stringify({status:'PASS',files:manifest.files.length,source_commit:manifest.source_commit,source_dirty:manifest.source_dirty,published:false,hardware_qualified:false}));
