import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../dist/web/',import.meta.url));
const port=Number(process.env.NB1_BROWSER_PORT||4176);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid NB1_BROWSER_PORT');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.wasm':'application/wasm','.woff2':'font/woff2','.webp':'image/webp','.png':'image/png','.zip':'application/zip','.md':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
  try{
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'});res.end();return;}
    const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
    let target=path.resolve(root,'.'+pathname);
    if(target!==path.resolve(root)&&!target.startsWith(path.resolve(root)+path.sep)){res.writeHead(403);res.end();return;}
    if((await fs.stat(target)).isDirectory())target=path.join(target,'index.html');
    const bytes=await fs.readFile(target);
    res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Permissions-Policy':'hid=(self)'});
    res.end(req.method==='HEAD'?undefined:bytes);
  }catch{res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');}
});
server.listen(port,'127.0.0.1',()=>console.log(`nb1 browser workbench: http://127.0.0.1:${port}/`));
