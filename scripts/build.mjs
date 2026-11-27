import { stageModel } from '@b1ug/blink1-models/stage';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const root=fileURLToPath(new URL('../',import.meta.url));
const source=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const dirty=Boolean(execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim());
const output=path.join(root,'dist');
const stage=await fs.mkdtemp(path.join(root,'.cache/ui-build-'));
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const compiler=path.join(root,'.cache/compiler');
const runtimeFiles=['nb1.wasm','wasm_exec.js','compiler-source.json','GO-LICENSE.txt','NB1-LICENSE.txt','COLORKIT-LICENSE.txt'];
for(const name of runtimeFiles)await fs.access(path.join(compiler,name));
const compilerSourceBytes=await fs.readFile(path.join(compiler,'compiler-source.json'));
const compilerReceipt=JSON.parse(compilerSourceBytes);
function exactKeys(value,expected){return value&&typeof value==='object'&&JSON.stringify(Object.keys(value).sort())===JSON.stringify([...expected].sort());}
if(!exactKeys(compilerReceipt.files,['nb1.wasm','wasm_exec.js','GO-LICENSE.txt','NB1-LICENSE.txt','COLORKIT-LICENSE.txt'])||!exactKeys(compilerReceipt.bridge_files,['compiler/bridge/bridge.go','compiler/wasm/main.go','compiler/oracle/main.go']))throw Error('Compiler provenance is incomplete; rebuild the compiler.');
const lockBytes=await fs.readFile(path.join(root,'compiler/source-lock.json'));
const sourceLock=JSON.parse(lockBytes);
if(compilerReceipt.status!=='PASS'||compilerReceipt.source_commit!==sourceLock.source_commit||hash(lockBytes)!==compilerReceipt.source_lock_sha256)throw Error('Compiler/source lock mismatch; rebuild the compiler.');
for(const [name,record] of Object.entries(compilerReceipt.files)){
  const bytes=await fs.readFile(path.join(compiler,name));
  if(bytes.length!==record.bytes||hash(bytes)!==record.sha256)throw Error(`Compiler cache integrity mismatch: ${name}`);
}
for(const [name,record] of Object.entries(compilerReceipt.bridge_files)){
  const bytes=await fs.readFile(path.join(root,name));
  if(bytes.length!==record.bytes||hash(bytes)!==record.sha256)throw Error(`Compiler bridge changed; rebuild the compiler: ${name}`);
}
const approved=JSON.parse(await fs.readFile(path.join(root,'src/shared/asset-provenance.json'),'utf8'));
for(const [file,record] of Object.entries(approved.files)){
  if(hash(await fs.readFile(path.join(root,file)))!==record.sha256)throw Error(`Vendored asset changed without provenance update: ${file}`);
}
for(const kind of ['web','extension']){
  const target=path.join(stage,kind);
  await fs.cp(path.join(root,'src',kind),target,{recursive:true});
  const shared=['compiler-loader.js','transport.js','commands.js','theme.css','assets','asset-provenance.json',kind==='web'?'vendor':'extension-controller.js'];
  for(const name of shared)await fs.cp(path.join(root,'src/shared',name),path.join(target,'shared',name),{recursive:true});
  if(kind==='web'){
    await fs.copyFile(path.join(root,'src/shared/player.js'),path.join(target,'shared/player.js'));
    await fs.cp(path.join(root,'src/shared/nightlab'),path.join(target,'shared/nightlab'),{recursive:true});
    const modelReceipt = JSON.parse(await fs.readFile(path.join(target, 'shared/nightlab/handoff-provenance.json'), 'utf8'));
    const nightlab = path.join(target, 'shared/nightlab');
    stageModel(nightlab, modelReceipt.model_package.manifest_sha256);
    const modelPackage = import.meta.resolve('@b1ug/blink1-models/stage');
    await fs.copyFile(new URL('./models/mk2/manifest.json', modelPackage), path.join(nightlab, 'manifest.json'));
    await fs.copyFile(new URL('./LICENSE', modelPackage), path.join(nightlab, 'MODEL-LICENSE.txt'));
  }
  await fs.mkdir(path.join(target,'shared/compiler'),{recursive:true});
  for(const name of runtimeFiles){
    if(name==='compiler-source.json')await fs.writeFile(path.join(target,'shared/compiler',name),compilerSourceBytes);
    else await fs.copyFile(path.join(compiler,name),path.join(target,'shared/compiler',name));
  }
  for(const [name,record] of Object.entries(compilerReceipt.files))if(hash(await fs.readFile(path.join(target,'shared/compiler',name)))!==record.sha256)throw Error(`Packaged compiler mismatch: ${kind}/${name}`);
  await fs.copyFile(path.join(root,'LICENSE'),path.join(target,'LICENSE.txt'));
}
const extensionManifest=JSON.parse(await fs.readFile(path.join(stage,'extension/manifest.json'),'utf8'));
if(extensionManifest.manifest_version!==3)throw Error('Only Manifest V3 is packaged.');
const expected=['alarms','storage'];
if(JSON.stringify([...extensionManifest.permissions].sort())!==JSON.stringify(expected))throw Error('Unexpected extension permission expansion.');
for(const key of ['host_permissions','optional_host_permissions','content_scripts','externally_connectable'])if(extensionManifest[key])throw Error(`Unexpected initial extension capability: ${key}`);

// Keep offline instructions at their maintained relative paths. This identity
// record precedes ZIP creation and never hashes itself or the containing ZIP.
const extensionRoot=path.join(stage,'extension');
await fs.cp(path.join(root,'docs'),path.join(extensionRoot,'docs'),{recursive:true});
for(const name of ['README.md','README.zh-CN.md'])await fs.copyFile(path.join(root,name),path.join(extensionRoot,name));
const buildInfo={schema_version:1,artifact_kind:'nb1-browser-development-candidate',source_commit:source,source_dirty:dirty,extension_version:extensionManifest.version,minimum_chrome_version:extensionManifest.minimum_chrome_version,published:false,hardware_qualified:false,compiler_source:compilerReceipt.source_commit,compiler_receipt_sha256:hash(compilerSourceBytes),go_toolchain:compilerReceipt.go_version||compilerReceipt.toolchain||null};
await fs.writeFile(path.join(extensionRoot,'BUILD-INFO.json'),JSON.stringify(buildInfo,null,2)+'\n');

const download=path.join(stage,'web/extension-download');await fs.mkdir(download,{recursive:true});
const zipper=`import pathlib,zipfile,sys\nsource=pathlib.Path(sys.argv[1]);dest=pathlib.Path(sys.argv[2])\nwith zipfile.ZipFile(dest,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:\n for p in sorted(source.rglob('*')):\n  if p.is_file():\n   info=zipfile.ZipInfo(p.relative_to(source).as_posix(),date_time=(2026,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o644<<16;z.writestr(info,p.read_bytes())\n`;
execFileSync('python3',['-c',zipper,path.join(stage,'extension'),path.join(download,'nb1-extension.zip')]);
const zipSHA256=hash(await fs.readFile(path.join(download,'nb1-extension.zip')));
await fs.writeFile(path.join(download,'SHA256SUMS'),zipSHA256+'  nb1-extension.zip\n');
await fs.cp(path.join(extensionRoot,'docs'),path.join(download,'docs'),{recursive:true});
for(const name of ['README.md','README.zh-CN.md','BUILD-INFO.json'])await fs.copyFile(path.join(extensionRoot,name),path.join(download,name));
for(const [source,target] of [['docs/PLAN.md','extension-plan.md'],['docs/PLAN.zh-CN.md','extension-plan.zh-CN.md']])await fs.copyFile(path.join(root,source),path.join(stage,'web',target));
for(const zh of [false,true]){
  const title=zh?'nb1 · 本地扩展包':'nb1 · Local extension package';
  const heading=zh?'安装开发版本':'Load the development build';
  const steps=zh?['下载并解压扩展包。','使用支持的桌面 Chrome，打开 chrome://extensions 并启用开发者模式。','选择“加载已解压的扩展程序”，选中解压目录。','打开扩展设置，先停止同灯的其他控制器，再明确选择 blink(1)。','首阶段提供手动控制和倒计时。软件验证与真实 USB 验收分开记录。']:['Download and unzip the extension package.','In supported desktop Chrome, open chrome://extensions and enable Developer mode.','Choose Load unpacked and select the extracted directory.','Open extension settings, stop other controllers for the same light, then explicitly choose blink(1).','The first milestone offers manual control and timer reminders. Software checks and real USB qualification are recorded separately.'];
  const suffix=zh?'.zh-CN':'';
  const page=`<!doctype html><html lang="${zh?'zh-CN':'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self';object-src 'none';base-uri 'none';form-action 'none'"><title>${title}</title><link rel="icon" href="../shared/assets/nb1-icon.png"><link rel="stylesheet" href="../shared/theme.css"><link rel="stylesheet" href="download.css"></head><body><main class="card"><a href="../">nb1</a><h1>${heading}</h1><p>${zh?'实验扩展，尚未发布到 Chrome Web Store；真实硬件验收单独记录。':'Experimental extension. Not published to the Chrome Web Store; hardware qualification is recorded separately.'}</p><p class="meta">${zh?'扩展版本':'Extension version'} ${extensionManifest.version} · Chrome ${extensionManifest.minimum_chrome_version}+ · ${zh?'仅 storage 与 alarms 权限':'storage and alarms permissions only'}</p><ol>${steps.map(s=>`<li>${s}</li>`).join('')}</ol><p><a href="nb1-extension.zip">${zh?'下载扩展 ZIP':'Download extension ZIP'}</a> · <a href="SHA256SUMS">SHA256SUMS</a></p><p class="checksum">SHA-256 <code>${zipSHA256}</code></p><p class="meta">${zh?'散列检查一致性，不是签名。请与可信交付来源提供的值对照。':'The checksum checks consistency, not a signature. Compare it with the value from your trusted delivery source.'}</p><ul><li><a href="docs/DISTRIBUTION${suffix}.md">${zh?'安装、更新、移除与支持范围':'Install, update, remove and support evidence'}</a></li><li><a href="docs/PRIVACY${suffix}.md">${zh?'本地数据与权限':'Local data and permissions'}</a></li><li><a href="docs/EXTENSION${suffix}.md">${zh?'扩展连接与倒计时行为':'Extension connection and timer behavior'}</a></li><li><a href="BUILD-INFO.json">${zh?'构建身份（源码、dirty 状态与 Go 来源）':'Build identity (source, dirty state and Go source)'}</a></li></ul><p><a href="${zh?'index.html':'zh.html'}">${zh?'English':'中文'}</a></p></main></body></html>`;
  await fs.writeFile(path.join(download,zh?'zh.html':'index.html'),page);
}
await fs.writeFile(path.join(download,'download.css'),'main{max-width:760px;margin:45px auto;padding:28px}h1{margin-top:22px}li+li{margin-top:10px}.checksum{font-size:11px;overflow-wrap:anywhere}.checksum code{word-break:break-all}@media(max-width:800px){main{margin:20px 14px;padding:20px}h1{font-size:28px}}');
// Public provenance covers only the website payload. Its own bytes are excluded
// to avoid a self-referential checksum; the outer build record includes it.
const webRoot=path.join(stage,'web'),webFiles={};
async function publicFiles(directory){
  for(const entry of await fs.readdir(directory,{withFileTypes:true})){
    const name=path.join(directory,entry.name);
    if(entry.isSymbolicLink())throw Error('Unexpected website symlink');
    if(entry.isDirectory())await publicFiles(name);
    else {const bytes=await fs.readFile(name);webFiles[path.relative(webRoot,name).split(path.sep).join('/')]={bytes:bytes.length,sha256:hash(bytes)};}
  }
}
await publicFiles(webRoot);
const siteBuild={schema_version:1,artifact_kind:'nb1-browser-development-preview',
  source:{repository:'https://github.com/b1ug/nb1-webhid',commit:source,dirty},
  core:{repository:'https://github.com/b1ug/nb1',version:'v0.1.1',source_commit:compilerReceipt.source_commit},
  channel:'development-preview',extension:{name:extensionManifest.name,status:'experimental',version:extensionManifest.version,hardware_qualified:false},
  compiler:{go_version:compilerReceipt.go_version,wasm_sha256:compilerReceipt.files['nb1.wasm'].sha256},
  self_manifest_excluded:true,files:Object.fromEntries(Object.entries(webFiles).sort(([a],[b])=>a.localeCompare(b)))};
await fs.writeFile(path.join(webRoot,'site-build.json'),JSON.stringify(siteBuild,null,2)+'\n');
const files=[];
async function walk(directory){for(const entry of await fs.readdir(directory,{withFileTypes:true})){const name=path.join(directory,entry.name);if(entry.isSymbolicLink())throw Error('Unexpected output symlink');if(entry.isDirectory())await walk(name);else{const bytes=await fs.readFile(name);files.push({path:path.relative(stage,name),bytes:bytes.length,sha256:hash(bytes)});}}}
await walk(stage);
const receipt={schema_version:1,artifact_kind:'browser-development-build',source_commit:source,source_dirty:dirty,published:false,hardware_qualified:false,compiler:compilerReceipt,files:files.sort((a,b)=>a.path.localeCompare(b.path))};
await fs.writeFile(path.join(stage,'build.json'),JSON.stringify(receipt,null,2)+'\n');
const backup=path.join(root,'.cache/previous-dist');
await fs.rm(backup,{recursive:true,force:true});
try{await fs.rename(output,backup);}catch(error){if(error.code!=='ENOENT')throw error;}
try{await fs.rename(stage,output);}catch(error){try{await fs.rename(backup,output);}catch{}throw error;}
await fs.rm(backup,{recursive:true,force:true});
console.log(JSON.stringify({status:'PASS',source_commit:source,source_dirty:dirty,files:files.length,output:'dist',extension:'dist/web/extension-download/nb1-extension.zip'}));
