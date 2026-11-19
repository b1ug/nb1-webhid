import {loadCompiler, callCompiler} from './shared/compiler-loader.js';
import {Blink1WebHID} from './shared/transport.js';
import {SequencePlayer} from './shared/player.js';

const $ = id => document.getElementById(id);
const messages = {
  en: {
    skip:'Skip to workbench', browserWorkbench:'WebHID', source:'Source',
    headline:'Workbench', intro:'Choose an Action, make it yours, and press Play.',
    yourLight:'Your light', connect:'Connect blink(1)', disconnect:'Disconnect', connectionOptions:'Connection options',
    ownership:'Stop the native nb1 daemon or other controllers using this light before connecting here.',
    ownershipCheck:'I have stopped other controllers for this light.',
    disconnectNote:'Disconnect keeps the last color. Use Off to turn the light dark. No device storage is written.',
    create:'Pick an Action', actionMode:'Action controls', customMode:'Custom JSON', customTitle:'Your custom request',
    customHint:'Your JSON is the draft. Play and Export use it exactly as written.', useAction:'Use Action controls',
    play:'Play', stop:'Stop', off:'Off', preview:'Preview without playing', help:'Help', advanced:'Advanced', requestJSON:'Request JSON',
    sequenceExample:'Sequence example', jsonNote:'Editing or importing JSON switches to a custom draft. Choose an Action to return to its controls.',
    previewTitle:'Compiled Sequence', notCompiled:'No preview yet.', compiledPlaceholder:'Your compiled Sequence will appear here.',
    previewNote:'Compiler output is separate from device command acceptance and physical light measurements.',
    stopNote:'Stop cancels upcoming Steps; a fade already sent may finish. Off turns the light dark.',
    commandedColors:'Last accepted colors · not an optical measurement',
    portable:'Keep a portable Sequence for native nb1. Import and Export never play the light.',
    export:'Export for nb1', import:'Import JSON', useCLI:'Use the file with nb1',
    cliNote:'Use a matching API v1 nb1 and your selected daemon. Saving a Pattern creates no playback.',
    extensionIntro:'Take manual control and timer reminders into the companion Chrome extension.',
    extensionPackage:'Extension package and instructions', extensionPlan:'Extension plan',
    footer:'nb1 · Local browser tools · MIT License',
    scope:'Software checks and real USB tests are recorded separately. Browser and daemon ownership must be switched explicitly.',
    compilerLoading:'Loading Go compiler…', compilerReady:'Ready to create', compilerError:'Light tools unavailable',
    disconnected:'Not connected', connected:'Connected', uncertain:'Device outcome unknown',
    hidSupported:'WebHID is available here. Connect opens the browser permission picker.',
    hidUnsupported:'Direct USB needs a supported desktop browser and HTTPS or localhost. Preview and Export still work.',
    initialStatus:'Choose an Action. Play compiles and checks it before sending.',
    changed:'Draft ready. Play will compile and validate these settings.',
    changedWhilePlaying:'Next draft updated. The current playback keeps its original settings.',
    customStatus:'Custom JSON is ready to check. Play uses this draft without replacing it.',
    confirmOwnership:'Open Connection options and confirm that other controllers are stopped, then connect.',
    connecting:'Waiting for the browser device picker…', connectedStatus:'Connected. No light command was sent.',
    pickerCancelled:'No device selected. The light was not changed.', closing:'Closing the device connection…',
    disconnectedStatus:'Connection closed. The last color may remain on the device.',
    compiling:'Checking your light request…', previewReady:'Preview ready. The light was not changed.',
    exporting:'Compiling the portable Sequence…', exportDone:'Exported light.sequence.json. The light was not changed.',
    importDone:'Imported as custom JSON. Play will check it before sending.',
    inputTooLarge:'The request file must be at most 1 MiB.',
    draftRaced:'The draft changed while compiling. Use Play, Preview or Export again for the current draft.',
    errorPrefix:'Could not finish:',
    openFailed:'The browser could not open blink(1). Stop the native nb1 daemon or disconnect other controllers using this light, then choose it again. If opening still fails, check the browser device permission. No light command was sent.',
    notConnected:'Connect your blink(1) before playing.',
    outcomeUnknown:'The device outcome is unknown. No automatic retry was made. Disconnect and check the light before reconnecting.',
    timingOverrun:'Playback stopped because the browser could not keep the timing. Keep this page visible and play again.',
    connectionChanged:'The device connection changed. The previous Sequence was stopped; select the current device and play again.',
    checking:'Checking…', playing:'Playing', stopping:'Stopping…',
    completed:'Done', cancelled:'Stopped', failed:'Playback stopped',
    completedStatus:'All scheduled commands and waits finished. Physical light was not measured.',
    stoppedStatus:'Upcoming Steps stopped. A fade already sent may finish; use Off to turn dark.',
    hiddenStatus:'Upcoming Steps stopped because this page is hidden. Return and press Play to start again.',
    offSending:'Turning the light dark…', offSent:'Off command accepted. Physical light was not measured.',
    idle:'', errorState:'Needs attention', viewDetails:'View details', steps:'Steps', nominal:'Nominal duration', milliseconds:'ms',
    color:'Color', color1:'First color', color2:'Second color', colorResolving:'Resolving with Go…', colorInvalid:'Check this color:',
    colorHelp:'Names, #abc, #RRGGBB, rgb8 or hsv JSON. Colors are resolved by the shared Go compiler.',
    bothSame:'Both · same', separateLEDs:'Separate', led:'LED', allLEDs:'Both LEDs (0)', led1:'LED 1 · blink(1)', led2:'LED 2 · ThingM', ledOrder:'Color order', ledForward:'First → LED 1 · second → LED 2', ledReverse:'First → LED 2 · second → LED 1',
    duration_ms:'Fade duration (ms)', period_ms:'Cycle duration (ms)', on_ms:'On duration (ms)', off_ms:'Off duration (ms)',
    attack_ms:'Rise (ms)', decay_ms:'Fall (ms)', rest_ms:'Rest (ms)', cycles:'Cycles', on_finish:'When finished',
    finishOff:'Turn off', finishHold:'Keep last color',
    desc_set:'Set a steady color immediately.', desc_off:'Turn the selected LED or both LEDs dark.',
    desc_fade:'Move smoothly from the current color to a new one.',
    desc_blink:'Switch a color on and off, with a clear pause between flashes.',
    desc_breathe:'Gently brighten and dim one color.', desc_pulse:'Rise and fall, then rest before the next pulse.',
    desc_alternate:'Exchange two colors between the two LEDs.',
    desc_orbit:'Crossfade two colors between the LEDs for an orbit-like movement.',
    desc_rainbow:'Travel through seven colors and return to red.',
    desc_custom:'An Action or Sequence authored in JSON, checked by the same Go compiler.',
    editorHelp:'JSON syntax and color samples are checked locally. Play and Preview use the shared Go compiler. Tab leaves the editor.',
  },
  'zh-CN': {
    bothSame:'两灯同色', separateLEDs:'两灯分色',
    skip:'跳到工作台', browserWorkbench:'WebHID', source:'源码',
    headline:'工作台', intro:'选个动作，调好参数，直接播放。',
    yourLight:'你的小灯', connect:'连接 blink(1)', disconnect:'断开连接', connectionOptions:'连接选项',
    ownership:'连接前，请先停止正在使用这只灯的 nb1 daemon 或其他控制器。',
    ownershipCheck:'我已停止这只灯的其他控制器。', disconnectNote:'断开会保留最后的颜色，熄灯请使用 Off。本工具不写入设备存储。',
    create:'选个动作', actionMode:'动作参数', customMode:'自定义 JSON', customTitle:'你的自定义请求',
    customHint:'JSON 就是当前草稿。播放与导出会使用原文，不会替换它。', useAction:'使用动作参数',
    play:'播放', stop:'停止', off:'熄灯', preview:'只预览，不播放', help:'帮助', advanced:'高级', requestJSON:'请求 JSON',
    sequenceExample:'Sequence 示例', jsonNote:'编辑或导入 JSON 后切换为自定义草稿。选择一个动作即可回到参数界面。',
    previewTitle:'编译后的 Sequence', notCompiled:'还没有编译预览。', compiledPlaceholder:'编译后的 Sequence 会显示在这里。',
    previewNote:'编译结果、设备接受指令、实际发光测量是不同的信息。',
    stopNote:'停止只取消后续 Step，已发送的渐变可能继续完成。熄灯会把灯变暗。',
    commandedColors:'最近接受的颜色 · 不是实际光学测量',
    portable:'保留一份可交给本机 nb1 的 Sequence。导入、导出都不会播放。',
    export:'导出给 nb1', import:'导入 JSON', useCLI:'在 nb1 中使用文件',
    cliNote:'请使用匹配的 API v1 nb1 和你选择的 daemon。保存 Pattern 不会创建播放。',
    extensionIntro:'在配套 Chrome 扩展中使用手动控制与倒计时提醒。',
    extensionPackage:'扩展包与安装说明', extensionPlan:'扩展计划', footer:'nb1 · 本地浏览器工具 · MIT 许可证',
    scope:'软件测试与真实 USB 验收分开记录。浏览器与 daemon 的设备控制权需要明确切换。',
    compilerLoading:'正在加载 Go 编译器…', compilerReady:'创作就绪', compilerError:'灯光工具不可用',
    disconnected:'未连接', connected:'已连接', uncertain:'设备结果未知',
    hidSupported:'当前环境提供 WebHID。点击连接后，浏览器会显示设备授权选择器。',
    hidUnsupported:'USB 直连需要支持的桌面浏览器，以及 HTTPS 或 localhost。预览、导出仍可使用。',
    initialStatus:'选择动作后即可播放，发送前会自动编译与校验。', changed:'草稿就绪，播放时会编译并校验当前参数。',
    changedWhilePlaying:'下一份草稿已更新，当前播放保持开始时的参数。',
    customStatus:'自定义 JSON 已就绪，播放时会校验这份原文。',
    confirmOwnership:'请展开连接选项，确认其他控制器已停止，再连接设备。',
    connecting:'等待浏览器设备选择器…', connectedStatus:'已连接，没有发送灯光指令。',
    pickerCancelled:'没有选择设备，灯光未改变。', closing:'正在关闭设备连接…', disconnectedStatus:'连接已关闭，设备可能保持最后的颜色。',
    compiling:'正在检查这份灯光请求…', previewReady:'预览就绪，灯光未改变。',
    exporting:'正在编译可移植的 Sequence…', exportDone:'已导出 light.sequence.json，灯光未改变。',
    importDone:'已导入为自定义 JSON，播放前会先校验。', inputTooLarge:'请求文件不能超过 1 MiB。',
    draftRaced:'编译过程中草稿发生变化，请对当前草稿重新播放、预览或导出。',
    errorPrefix:'未能完成：', openFailed:'浏览器未能打开 blink(1)。请先停止使用这只灯的 nb1 daemon，或断开其他控制器，再重新选择设备。如果仍然失败，再检查浏览器的设备授权。本次没有发送灯光指令。',
    notConnected:'请先连接 blink(1)，再开始播放。',
    outcomeUnknown:'设备执行结果未知，未自动重试。请断开并检查灯的状态，再重新连接。',
    timingOverrun:'浏览器未能保持要求的时序，播放已停止。请保持此页面可见，再次手动播放。',
    connectionChanged:'设备连接发生变化，之前的 Sequence 已停止。请确认当前设备，再手动播放。',
    checking:'检查中…', playing:'播放中', stopping:'停止中…', completed:'已完成', cancelled:'已停止', failed:'执行失败',
    completedStatus:'计划内的指令与等待均已结束，未进行实际发光测量。',
    stoppedStatus:'后续 Step 已停止。已发送的渐变可能继续完成；如需变暗，请使用熄灯。',
    hiddenStatus:'页面被隐藏，已停止后续 Step。回到页面后可手动重新播放。',
    offSending:'正在熄灯…', offSent:'熄灯指令已接受，未进行实际发光测量。',
    idle:'', errorState:'需要检查', viewDetails:'查看详情', steps:'Step 数', nominal:'名义时长', milliseconds:'毫秒',
    color:'颜色', color1:'第一种颜色', color2:'第二种颜色', colorResolving:'正在通过 Go 解析…', colorInvalid:'请检查颜色：',
    colorHelp:'支持名称、#abc、#RRGGBB、rgb8 或 hsv JSON，统一由 Go 编译器解析。',
    led:'LED', allLEDs:'双灯（0）', led1:'LED 1 · blink(1)', led2:'LED 2 · ThingM', ledOrder:'颜色分配', ledForward:'第一色 → LED 1 · 第二色 → LED 2', ledReverse:'第一色 → LED 2 · 第二色 → LED 1',
    duration_ms:'渐变时长（毫秒）', period_ms:'每轮时长（毫秒）', on_ms:'亮灯时长（毫秒）', off_ms:'灭灯时长（毫秒）',
    attack_ms:'升亮（毫秒）', decay_ms:'变暗（毫秒）', rest_ms:'停歇（毫秒）', cycles:'循环次数', on_finish:'结束时',
    finishOff:'熄灯', finishHold:'保留最后颜色',
    desc_set:'立即设置一个稳定的颜色。', desc_off:'关闭选中的 LED，或同时关闭双灯。',
    desc_fade:'从当前颜色平滑渐变到新颜色。', desc_blink:'在亮与灭之间切换，闪烁间保留清晰的停歇。',
    desc_breathe:'让一种颜色轻柔地升亮、变暗。', desc_pulse:'升亮、回落、停歇，再开始下一次脉冲。',
    desc_alternate:'让两种颜色在双灯间交替交换。', desc_orbit:'让两种颜色在双灯间交叉渐变，呈现环绕感。',
    desc_rainbow:'经过七种颜色，再回到红色。', desc_custom:'直接编写 Action 或 Sequence，使用同一个 Go 编译器校验。',
    editorHelp:'JSON 语法与色样在本地检查，播放和预览使用共用 Go 编译器。Tab 可离开编辑器。',
  },
};
const editorZH = {
  'Format JSON':'格式化 JSON', 'Plain text':'纯文本', 'Go to error':'定位错误',
  'Sequence JSON editor':'请求 JSON 编辑器',
  'JSON syntax is valid. Preview checks the Sequence rules.':'JSON 语法有效，播放或预览会检查 Sequence 规则。',
  'Color samples match the local nb1 resolver.':'色样与本地 Go 编译器解析结果一致。',
  'Some color samples are unavailable. Preview checks the color fields.':'部分色样不可用，请播放或预览以检查颜色字段。',
  'Resolving color samples with local nb1…':'正在用本地 Go 编译器解析色样…',
};
const defaults = [
  {kind:'set',color:'#086040',led:0}, {kind:'off',led:0}, {kind:'fade',color:'#abc',duration_ms:1500,led:0},
  {kind:'blink',color:'#080808',on_ms:1000,off_ms:1000,cycles:3,on_finish:'off',led:0},
  {kind:'breathe',color:'#080808',period_ms:4000,cycles:3,on_finish:'off',led:0},
  {kind:'pulse',color:'#080808',attack_ms:300,decay_ms:700,rest_ms:1000,cycles:3,on_finish:'off',led:0},
  {kind:'alternate',colors:['red','blue'],leds:[1,2],period_ms:6000,cycles:3,on_finish:'off'},
  {kind:'orbit',colors:['red','blue'],leds:[1,2],period_ms:6000,cycles:3,on_finish:'off'},
  {kind:'rainbow',period_ms:7000,cycles:3,on_finish:'off',led:0},
];
const numericKeys = ['duration_ms','period_ms','on_ms','off_ms','attack_ms','decay_ms','rest_ms','cycles'];
const forms = new Map(defaults.map(action => [action.kind, Object.fromEntries(Object.entries(action).map(([key,value]) => [key, Array.isArray(value) ? value.map(String) : String(value)]))]));
let language = 'en';
try { if(localStorage.getItem('nb1.browser.language')==='zh-CN') language='zh-CN'; } catch {}
const t = key => messages[language][key] ?? messages.en[key] ?? key;
const title = kind => kind[0].toUpperCase()+kind.slice(1);
let ready=false, commandBusy=false, compileBusy=false, playPending=false, revision=0, intent=0;
let mode='action', selectedKind='set', editor=null, syncingEditor=false;
let compiled=null, compiledRevision=-1, compilerState='compilerLoading';
let notice={key:'initialStatus'}, phase={state:'idle',step:0,total:0}, activeLabel=null;
let hiddenCancellation=false;
const colorTimers=new Map(), colorControls=new Map();
let player;
const transport = new Blink1WebHID({onDisconnect:()=>{
  intent++;
  void player?.stop().catch(error=>showError(error));
  setNotice('disconnectedStatus'); updateControls();
}});
player = new SequencePlayer({transport,onState:state=>{
  phase=state;
  if(state.targets?.length) renderLiveTargets(state.targets);
  if(state.state==='failed') showError(state.error);
  else if(state.state==='cancelled') setNotice(hiddenCancellation?'hiddenStatus':'stoppedStatus');
  else if(state.state==='completed' && state.total>0) setNotice('completedStatus');
  renderPhase(); updateControls();
}});
function localError(key) { const error=new Error(key); error.uiKey=key; return error; }
function errorText(error) {
  if(error?.uiKey) return t(error.uiKey);
  const key={open_failed:'openFailed',not_connected:'notConnected',outcome_unknown:'outcomeUnknown',timing_overrun:'timingOverrun',connection_changed:'connectionChanged'}[error?.code];
  return key?t(key):error?.message||String(error);
}
function renderNotice() {
  $('status').textContent=notice.error?errorText(notice.error):t(notice.key);
  $('status').hidden=!notice.error&&['initialStatus','changed','customStatus','previewReady','exportDone','importDone','connectedStatus','completedStatus','stoppedStatus','offSent'].includes(notice.key);
  $('status').setAttribute('aria-live',notice.error?'polite':'off');
  $('status').classList.toggle('error',Boolean(notice.error));
}
function setNotice(key) { notice={key}; renderNotice(); renderPhase(); }
function showError(error) { notice={error}; renderNotice(); renderPhase(); }
function updateControls() {
  const running=playPending||player.running;
  $('compiler-status').textContent=t(compilerState);
  $('connection').textContent=t(transport.uncertain?'uncertain':transport.connected?'connected':'disconnected');
  const info=transport.deviceInfo;
  $('device-info').textContent=info?info.productName+' · '+info.vendorId.toString(16)+':'+info.productId.toString(16):'—';
  $('connect').disabled=commandBusy||transport.connected||transport.uncertain||!navigator.hid||!window.isSecureContext;
  $('disconnect').disabled=commandBusy||(!transport.connected&&!transport.uncertain&&!info);
  $('play').disabled=!ready||commandBusy||compileBusy||running||!transport.connected;
  const actions=document.querySelector('.play-actions');actions.dataset.active=String(running||compileBusy);actions.dataset.device=String(transport.connected||transport.uncertain||Boolean(transport.deviceInfo));
  $('stop').disabled=commandBusy||(!running&&!compileBusy);
  $('off').disabled=!ready||commandBusy||!transport.connected;
  $('preview').disabled=!ready||compileBusy;
  $('export').disabled=!ready||compileBusy;
  $('hid-support').textContent=t(navigator.hid&&window.isSecureContext?'hidSupported':'hidUnsupported');
}
function renderPhase() {
  const key={validating:'checking',playing:'playing',stopping:'stopping',completed:'completed',cancelled:'cancelled',failed:'failed'}[phase.state]||'idle';
  const active=['playing','stopping'].includes(phase.state);
  const label=active&&activeLabel?(activeLabel==='custom'?t('customMode'):title(activeLabel)):'';
  $('play-state').dataset.state=phase.state;
  $('play-state').textContent=notice.error?t('errorState')+' · ':t(key)+(label?' · '+label:'')+(['playing','stopping'].includes(phase.state)&&phase.total?' · '+phase.step+'/'+phase.total:'');
  if(notice.error){const link=document.createElement('a');link.href='#status';link.textContent=t('viewDetails');$('play-state').append(link);}
  if(!notice.error&&!transport.connected&&!transport.uncertain&&phase.state==='idle') {
    $('play-state').textContent=t('notConnected')+' ';
    const link=document.createElement('a');link.href='#connect';link.textContent=t('connect');$('play-state').append(link);
  }
  $('play-state').hidden=Boolean(notice.error)||!$('play-state').textContent;
  $('play-state').setAttribute('aria-live',notice.error?'off':'polite');
  $('play-state').classList.toggle('error',Boolean(notice.error));
  $('play-progress').hidden=!['playing','stopping'].includes(phase.state)||!phase.total;
  $('play-progress').max=phase.total||1; $('play-progress').value=phase.step||0;
}
function renderSwatches(container, targets) {
  container.replaceChildren();
  for(const target of targets) {
    const chip=document.createElement('span');chip.className='swatch';
    const sample=document.createElement('i');sample.style.backgroundColor=target.color;
    chip.append(sample,document.createTextNode('LED '+target.led+' '+target.color));container.append(chip);
  }
}
function renderLiveTargets(targets) {
  const existing=new Map();
  for(const node of $('live-swatches').children) {
    const old=node.dataset; if(old.led!==undefined) existing.set(Number(old.led),{led:Number(old.led),color:old.color});
  }
  for(const target of targets) {
    if(target.led===0){existing.clear();existing.set(0,target);}
    else {existing.delete(0);existing.set(target.led,target);}
  }
  renderSwatches($('live-swatches'),[...existing.values()]);
  [...$('live-swatches').children].forEach((node,index)=>{const target=[...existing.values()][index];node.dataset.led=target.led;node.dataset.color=target.color;});
  $('live-targets').hidden=false;
}
function renderPreview() {
  if(!compiled||compiledRevision!==revision) {
    $('compiled').textContent=t('compiledPlaceholder');$('preview-summary').textContent=t('notCompiled');$('swatches').replaceChildren();return;
  }
  $('compiled').textContent=JSON.stringify(compiled.sequence,null,2);
  $('preview-summary').textContent=t('steps')+': '+compiled.total_steps+' · '+t('nominal')+': '+compiled.nominal_duration_ms+' '+t('milliseconds');
  const targets=new Map();
  for(const target of [...(compiled.sequence.initial||[]),...compiled.sequence.steps.flatMap(step=>step.targets)])targets.set(target.led+'/'+target.color,target);
  renderSwatches($('swatches'),[...targets.values()].slice(0,12));
}
function dirty(key) {
  revision++;compiled=null;compiledRevision=-1;renderPreview();
  setNotice(key||(playPending||player.running?'changedWhilePlaying':mode==='custom'?'customStatus':'changed'));updateControls();
}
// Keep authored ColorInput JSON intact until Go sees it. JSON.parse here would
// erase duplicate keys and change accepted/rejected Go numeric representations.
function rawColor(value) {
  const raw=value.trim();
  return /^[{\["]/.test(raw)?raw:JSON.stringify(raw);
}
function formRequest() {
  const form=forms.get(selectedKind),parts=['"kind":'+JSON.stringify(selectedKind)];
  if(selectedKind==='set'&&form.led==='separate') {
    const steps=form.separateColors.map((color,index)=>'{"targets":[{"led":'+(index+1)+',"color":'+rawColor(color)+'}],"fade_ms":0,"hold_ms":0}');
    return '{"sequence":{"timing":"serial","steps":['+steps.join(',')+'],"repeat":1,"on_finish":"hold"}}';
  }
  if(form.color!==undefined)parts.push('"color":'+rawColor(form.color));
  if(form.colors)parts.push('"colors":['+form.colors.map(rawColor).join(',')+']');
  for(const key of numericKeys)if(form[key]!==undefined)parts.push(JSON.stringify(key)+':'+(form[key].trim()||'null'));
  if(form.led!==undefined)parts.push('"led":'+form.led);
  if(form.leds)parts.push('"leds":['+form.leds.join(',')+']');
  if(form.on_finish!==undefined)parts.push('"on_finish":'+JSON.stringify(form.on_finish));
  return '{\n  "action": {'+parts.join(', ')+ '}\n}';
}
function replaceDraft(raw, custom=false) {
  syncingEditor=true;
  try { if(editor)editor.setValue(raw,false);else $('request').value=raw; } finally { syncingEditor=false; }
  if(custom)mode='custom';
  dirty(); renderMode();
}
function updateFormDraft() { replaceDraft(formRequest()); }
function addField(key, options=null) {
  const form=forms.get(selectedKind);
  if(options) {
    const field=document.createElement('fieldset');field.className='field choice-field'+(key==='leds'?' full':'');field.id='param-'+key;
    const legend=document.createElement('legend');legend.textContent=t(key);
    const group=document.createElement('div');group.className='choice-group'+(key==='leds'?' stacked':'');
    for(const [value,message] of options) {
      const label=document.createElement('label');label.className='choice';
      const input=document.createElement('input');input.type='radio';input.name='param-'+key;input.value=value;
      input.checked=(key==='leds'?form.leds.join(','):form[key])===value;
      const caption=document.createElement('span');caption.textContent=t(message);
      input.addEventListener('change',()=>{if(input.checked){
        const redraw=selectedKind==='set'&&key==='led'&&((form.led==='separate')!==(input.value==='separate'));
        form[key]=key==='leds'?input.value.split(','):input.value;
        if(selectedKind==='set'&&form.led==='separate'&&!form.separateColors)form.separateColors=[form.color,'blue'];
        updateFormDraft();if(redraw){renderFields();document.querySelector('#param-led input:checked')?.focus({preventScroll:true});}
      }});
      label.append(input,caption);group.append(label);
    }
    field.append(legend,group);$('action-fields').append(field);return;
  }
  const field=document.createElement('div');field.className='field';
  const label=document.createElement('label');label.htmlFor='param-'+key;label.textContent=t(key);
  const input=document.createElement('input');input.id='param-'+key;
  input.type='number';input.min=key==='cycles'?'1':'0';input.step=key==='cycles'?'1':'10';input.inputMode='numeric';
  input.value=form[key];
  input.addEventListener('input',()=>{
    form[key]=input.value;
    updateFormDraft();
  });
  field.append(label,input);$('action-fields').append(field);
}
function queueColor(index, input, picker, caption) {
  clearTimeout(colorTimers.get(index));
  const raw=input.value, currentKind=selectedKind;
  caption.textContent=t('colorResolving');caption.classList.remove('invalid');
  colorTimers.set(index,setTimeout(async()=>{
    try {
      const result=await callCompiler('resolveColor',rawColor(raw));
      if(!input.isConnected||input.value!==raw||selectedKind!==currentKind||mode!=='action')return;
      picker.value=result.canonical_color;caption.textContent=result.canonical_color;
    }catch(error){
      if(!input.isConnected||input.value!==raw||selectedKind!==currentKind||mode!=='action')return;
      caption.textContent=t('colorInvalid')+' '+errorText(error);caption.classList.add('invalid');
    }
  },120));
}
function selectedColorSet() { return window.NB1ColorSets?.get(window.NB1ColorSets.selectedId); }
function renderColorPalette(control) {
  const set=selectedColorSet();control.shelf.replaceChildren();
  control.shelf.setAttribute('aria-label',set?.label[language]||(language==='en'?'Colors':'颜色'));
  for(const color of set?.colors||[]) {
    const button=document.createElement('button');button.type='button';button.className='palette-color';button.dataset.colorSetSwatch='';button.title=color;button.setAttribute('aria-label',color);button.style.backgroundColor=color;
    button.addEventListener('click',()=>control.update(color));control.shelf.append(button);
  }
}
function refreshColorPalettes() { for(const control of colorControls.values())renderColorPalette(control); }
function colorSetFromEvent(event) {
  const id=event.detail?.id,set=window.NB1ColorSets?.get(id);
  return typeof id==='string'&&set?.id===id?set:null;
}
function colorSetDraftChanged() { $('action-fields').dispatchEvent(new Event('input',{bubbles:true})); }
document.addEventListener('nb1-color-set-browse',()=>refreshColorPalettes());
document.addEventListener('nb1-color-sets-ready',()=>{refreshColorPalettes();window.NB1ColorSets.refresh();});
document.addEventListener('nb1-color-set-pair',event=>{
  const set=colorSetFromEvent(event);if(!set||mode!=='action'||colorControls.size!==2)return;
  if(!Array.isArray(set.pair)||set.pair.length!==2)return;
  const form=forms.get(selectedKind),colors=selectedKind==='set'&&form.led==='separate'?form.separateColors:form.colors;
  if(!Array.isArray(colors)||colors.length!==2)return;
  colors.splice(0,2,...set.pair);
  for(const [index,control] of colorControls){control.input.value=colors[index];queueColor(index,control.input,control.picker,control.caption);}
  updateFormDraft();colorSetDraftChanged();
});
document.addEventListener('nb1-color-set-sequence',event=>{
  const set=colorSetFromEvent(event);if(!set||set.id==='essentials'||mode!=='action'||!colorControls.size)return;
  const sequence=window.NB1ColorSets.sequence(set.id);
  replaceDraft(JSON.stringify({sequence},null,2),true);renderFields();$('advanced').open=true;
  $('advanced').querySelector(':scope > summary').focus({preventScroll:true});colorSetDraftChanged();
});
function addColor(index,pair) {
  const form=forms.get(selectedKind),colors=selectedKind==='set'&&form.led==='separate'?form.separateColors:form.colors;
  const field=document.createElement('div');field.className='field full color-field';
  const label=document.createElement('label');label.htmlFor='color-input-'+index;label.textContent=t(pair?(index?'color2':'color1'):'color');
  const row=document.createElement('div');row.className='color-entry';
  const picker=document.createElement('input');picker.id='color-picker-'+index;picker.type='color';picker.value='#086040';picker.setAttribute('aria-label',label.textContent+' · '+(language==='en'?'picker':'调色板'));
  const input=document.createElement('input');input.id='color-input-'+index;input.spellcheck=false;input.autocomplete='off';input.value=pair?colors[index]:form.color;input.setAttribute('aria-label',label.textContent);
  const caption=document.createElement('p');caption.id='color-result-'+index;caption.className='color-result';
  const shelf=document.createElement('div');shelf.id='palette-'+index;shelf.className='palette';shelf.setAttribute('aria-label',language==='en'?'Common colors':'常用颜色');
  const update=value=>{
    input.value=value;if(pair)colors[index]=value;else form.color=value;
    updateFormDraft();queueColor(index,input,picker,caption);
  };
  input.addEventListener('input',()=>update(input.value));
  picker.addEventListener('input',()=>update(picker.value));
  const control={input,picker,caption,shelf,update};colorControls.set(index,control);renderColorPalette(control);
  row.append(picker,input);field.append(label,row,shelf,caption);$('action-fields').append(field);
  queueColor(index,input,picker,caption);
}
function renderFields() {
  for(const timer of colorTimers.values())clearTimeout(timer);colorTimers.clear();colorControls.clear();
  $('action-fields').replaceChildren();
  if(mode==='custom'){window.NB1ColorSets?.refresh();return;}
  const form=forms.get(selectedKind),separate=selectedKind==='set'&&form.led==='separate',pair=Boolean(form.colors)||separate;
  if(selectedKind==='set')addField('led',[['0','bothSame'],['separate','separateLEDs'],['1','led1'],['2','led2']]);
  if(form.color!==undefined&&!separate)addColor(0,false);
  if(pair){addColor(0,true);addColor(1,true);}
  if(form.color!==undefined||pair){const help=document.createElement('p');help.className='footnote color-help';help.textContent=t('colorHelp');$('action-fields').append(help);}
  for(const key of numericKeys)if(form[key]!==undefined)addField(key);
  if(form.led!==undefined&&selectedKind!=='set')addField('led',[['0','allLEDs'],['1','led1'],['2','led2']]);
  if(form.leds)addField('leds',[['1,2','ledForward'],['2,1','ledReverse']]);
  if(form.on_finish!==undefined)addField('on_finish',[['off','finishOff'],['hold','finishHold']]);
  window.NB1ColorSets?.refresh();
}
function renderMode() {
  $('mode-label').textContent=t(mode==='custom'?'customMode':'actionMode');
  $('action-title').textContent=mode==='custom'?t('customTitle'):title(selectedKind);
  $('action-description').textContent=t('desc_'+(mode==='custom'?'custom':selectedKind));
  $('custom-hint').hidden=mode!=='custom';$('action-fields').hidden=mode==='custom';
  for(const button of $('presets').children)button.setAttribute('aria-pressed',String(mode==='action'&&button.dataset.kind===selectedKind));
}
function useAction(kind) {
  if(mode==='action'&&selectedKind===kind&&$('action-fields').children.length)return;
  selectedKind=kind;mode='action';replaceDraft(formRequest());renderFields();
}
function applyLanguage() {
  document.documentElement.lang=language;document.title='nb1 WebHID';
  for(const node of document.querySelectorAll('[data-i18n]'))node.textContent=t(node.dataset.i18n);
  $('language').textContent=language==='en'?'中文':'EN';$('language').setAttribute('aria-label',language==='en'?'Switch to Chinese':'切换为英文');
  document.querySelector('[data-i18n="extensionPlan"]').href=language==='en'?'./extension-plan.md':'./extension-plan.zh-CN.md';
  document.querySelector('[data-i18n="extensionPackage"]').href=language==='en'?'./extension-download/':'./extension-download/zh.html';
  window.nb1Locale={translate(value){
    if(language==='en')return {
      'JSON syntax is valid. Preview checks the Sequence rules.':'JSON syntax is valid. Play checks the Sequence rules automatically.',
      'Some color samples are unavailable. Preview checks the color fields.':'Some color samples are unavailable. Play or Preview validates the color fields.',
    }[value]||value;
    return editorZH[value]||value.replace(/^Line (\d+), column (\d+): /,'第 $1 行，第 $2 列：');
  }};
  const toolbar=document.querySelectorAll('.nb1-json-toolbar button');
  if(toolbar.length===2){toolbar[0].textContent=window.nb1Locale.translate('Format JSON');toolbar[1].textContent=window.nb1Locale.translate('Plain text');}
  document.dispatchEvent(new Event('nb1-locale-change'));
  const help=document.querySelector('.nb1-json-help');if(help)help.textContent=t('editorHelp');
  renderMode();renderFields();renderPreview();renderNotice();renderPhase();updateControls();
}
async function compileDraft() {
  const start=revision,raw=$('request').value;
  const result=await callCompiler('compileRequest',raw);
  if(start!==revision)throw localError('draftRaced');
  compiled=result;compiledRevision=start;renderPreview();
  return result;
}
async function compileOperation(key,work) {
  if(compileBusy)return;compileBusy=true;setNotice(key);updateControls();
  try { await work(); }catch(error){showError(error);}
  finally{compileBusy=false;updateControls();}
}
async function deviceOperation(key,work) {
  if(commandBusy)return;commandBusy=true;setNotice(key);updateControls();
  try{await work();}catch(error){showError(error);}
  finally{commandBusy=false;updateControls();}
}
$('request').addEventListener('input',()=>{
  if(syncingEditor)return;
  const changedMode=mode!=='custom';mode='custom';dirty();renderMode();if(changedMode)renderFields();
});
$('language').addEventListener('click',()=>{
  language=language==='en'?'zh-CN':'en';try{localStorage.setItem('nb1.browser.language',language);}catch{}applyLanguage();
});
$('ownership').addEventListener('change',updateControls);
$('connect').addEventListener('click',()=>{
  if(!$('ownership').checked){$('connection-options').open=true;$('ownership').focus();setNotice('confirmOwnership');return;}
  void deviceOperation('connecting',async()=>{
    const selected=await transport.connect();
    if(selected){$('connection-options').open=false;$('live-targets').hidden=true;$('live-swatches').replaceChildren();}
    setNotice(selected?'connectedStatus':'pickerCancelled');
  });
});
$('disconnect').addEventListener('click',()=>{
  intent++;void deviceOperation('closing',async()=>{
    // A failed in-flight write must not skip the user's explicit close request.
    // Only the playback error is consumed; an unconfirmed close still fails.
    try { await player.stop(); } catch {}
    await transport.disconnect();setNotice('disconnectedStatus');
  });
});
$('play').addEventListener('click',()=>{
  if(compileBusy||commandBusy||playPending||player.running)return;
  const requestIntent=++intent, connection=transport.connectionEpoch;
  void compileOperation('compiling',async()=>{
    const result=await compileDraft();
    if(requestIntent!==intent||document.hidden)return;
    if(connection!==transport.connectionEpoch)throw localError('connectionChanged');
    if(!transport.connected)throw localError('notConnected');
    hiddenCancellation=false;activeLabel=mode==='custom'?'custom':selectedKind;playPending=true;
    // Do not hold commandBusy through the Sequence: Stop, Off and draft editing
    // must stay responsive while host scheduling and device fades are running.
    window.dispatchEvent(new Event('nb1-playback-requested'));
    const run=player.play(result);updateControls();
    void run.catch(error=>showError(error)).finally(()=>{playPending=false;renderPhase();updateControls();});
  });
});
$('stop').addEventListener('click',()=>{
  intent++;hiddenCancellation=false;
  void player.stop().then(()=>{setNotice('stoppedStatus');updateControls();},error=>{showError(error);updateControls();});
});
$('off').addEventListener('click',()=>{
  intent++;hiddenCancellation=false;
  void deviceOperation('offSending',async()=>{await player.off();activeLabel=null;renderPhase();setNotice('offSent');});
});
$('preview').addEventListener('click',()=>void compileOperation('compiling',async()=>{
  await compileDraft();$('preview-details').open=true;setNotice('previewReady');
}));
$('export').addEventListener('click',()=>void compileOperation('exporting',async()=>{
  const result=await compileDraft();
  const url=URL.createObjectURL(new Blob([JSON.stringify({sequence:result.sequence},null,2)+'\n'],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download='light.sequence.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice('exportDone');
}));
$('import').addEventListener('click',()=>$('file').click());
$('file').addEventListener('change',async()=>{
  const file=$('file').files?.[0];if(!file)return;
  const start=revision;
  try {
    if(file.size>1048576)throw localError('inputTooLarge');
    const raw=await file.text();if(start!==revision)throw localError('draftRaced');
    replaceDraft(raw,true);renderFields();$('advanced').open=true;setNotice('importDone');
  }catch(error){showError(error);}finally{$('file').value='';}
});
$('sequence-example').addEventListener('click',()=>{
  replaceDraft(JSON.stringify({sequence:{timing:'serial',steps:[{targets:[{led:0,color:'red'}],fade_ms:1000,hold_ms:1000},{targets:[{led:0,color:'#abc'}],fade_ms:1000,hold_ms:1000}],repeat:1,on_finish:'off'}},null,2),true);
  renderFields();$('advanced').open=true;
});
$('use-action').addEventListener('click',()=>useAction(selectedKind));
$('advanced').addEventListener('toggle',()=>{if($('advanced').open)editor?.refreshColors();});
for(const action of defaults) {
  const button=document.createElement('button');button.className='preset';button.type='button';button.dataset.kind=action.kind;
  button.append(window.NB1ActionIcons?.create(action.kind)||document.createTextNode('•'),document.createTextNode(title(action.kind)));
  button.addEventListener('click',()=>useAction(action.kind));$('presets').append(button);
}
function suspendPlayback() {
  intent++;
  if(!player.running&&!playPending&&!compileBusy)return;
  hiddenCancellation=true;
  void player.stop().then(()=>{setNotice('hiddenStatus');updateControls();},error=>{showError(error);updateControls();});
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)suspendPlayback();});
window.addEventListener('pagehide',suspendPlayback);
applyLanguage();
try {
  await loadCompiler();ready=true;compilerState='compilerReady';
  editor=window.NB1JSONEditor?.mount($('request'),{resolveColor:async raw=>(await callCompiler('resolveColor',raw)).canonical_color})||null;
  applyLanguage();
}catch(error){compilerState='compilerError';showError(error);updateControls();}
