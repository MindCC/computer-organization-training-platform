import { ASSEMBLY_PARTS, assemblyCheck, reconcileInstallation } from './hardwareAssembly.js';
import { CABLES, reconcileStructure } from './completeAssembly.js';

export const PRACTICE_FAULTS = [
  {id:'power',title:'工单 A · 启动停在处理器检查',symptom:'电源指示已亮，但处理器初始化无法完成。请检查装配和连接。'},
  {id:'cooling',title:'工单 B · 散热检查未通过',symptom:'教学自检在散热保护检查处停止。请检查散热组件及连接。'},
  {id:'storage',title:'工单 C · 未识别到系统盘',symptom:'主机可进行处理器检查，但存储设备未被完整识别。请排查数据与供电通路。'},
];

export function createPracticeSeed(parts,mode,faultId) {
  if(mode!=='fault')return {installed:{},structure:reconcileStructure({}, {},parts)};
  if(!PRACTICE_FAULTS.some(f=>f.id===faultId))throw new Error('Unknown practice fault');
  const installed=reconcileInstallation(parts,parts);
  const structure={open:true,motherboard:true,psu:true,cooler:parts.cpu,cables:Object.fromEntries(CABLES.map(c=>[c.id,true]))};
  if(faultId==='power')delete structure.cables.eps;
  if(faultId==='storage')delete structure.cables.sata;
  if(faultId==='cooling'){structure.cooler=false;delete structure.cables.fan;}
  return {installed,structure:reconcileStructure(structure,installed,parts)};
}

const WHY={open:'打开侧板后才能接触安装位，避免隔着机箱操作。',motherboard:'主板承载处理器、内存和扩展插槽，需要先固定。',psu:'电源为主板、处理器和硬盘提供电能。',cpu:'CPU 方向标记与插座一致，才能正确接触。',memory:'DIMM 缺口用于防止内存装反。',storage:'硬盘需要固定，也需要数据和供电两条连接。',gpu:'独立显卡通过 PCIe 插槽与主板通信。',cooler:'散热器接触 CPU，并通过风扇帮助散热。',atx:'24-pin 为主板供电，不能代替 CPU 的独立供电。',eps:'CPU 8-pin 为处理器供电，与主板 24-pin 分工不同。',fan:'CPU_FAN 接口为散热风扇提供连接。',sata:'SATA 数据线负责主板与硬盘通信。','sata-power':'硬盘供电与数据线缺一不可。',boot:'自检确认核心部件、散热与连接均已准备好。'};

export function practiceNextStep(installed,raw,parts) {
  const structure=reconcileStructure(raw,installed,parts);
  const steps=[{id:'open',title:'打开侧板',done:structure.open},{id:'motherboard',title:'固定主板',done:structure.motherboard},{id:'psu',title:'固定电源',done:structure.psu},
    ...ASSEMBLY_PARTS.filter(p=>!(p.id==='gpu'&&parts.gpu==='gpu-integrated')).map(p=>({id:p.id,title:'安装'+p.label,done:installed[p.id]===parts[p.id],target:p.socket})),
    {id:'cooler',title:'固定 CPU 散热器',done:structure.cooler},...CABLES.map(c=>({id:c.id,title:'连接'+c.label,done:structure.cables[c.id],target:c.fromLabel+' → '+c.toLabel})),{id:'boot',title:'执行开机自检',done:false}];
  const step=steps.find(s=>!s.done);
  return {...step,why:WHY[step.id],number:steps.indexOf(step)+1,total:steps.length};
}

export function practiceBootFeedback(installed,raw,parts) {
  const s=reconcileStructure(raw,installed,parts);
  if(!s.motherboard||!s.psu||!s.cables.atx)return '供电检查未通过，请检查主板、电源及其供电通路。';
  if(!installed.cpu||!installed.memory||!s.cables.eps)return '处理器 / 内存初始化未通过，请检查部件及供电通路。';
  if(!s.cooler||!s.cables.fan)return '散热保护检查未通过，请检查散热组件及风扇连接。';
  if(!installed.storage||!s.cables.sata||!s.cables['sata-power'])return '存储设备未被完整识别，请检查数据与供电通路。';
  if(!assemblyCheck(installed,parts).ready)return '显示输出检查未通过，请检查显示部件。';
  return '';
}

export function recordPracticeEvent(session,event,now=Date.now()) {
  if(session.completedAt)return session;
  const entry={...event,at:now};
  return {...session,events:[...session.events,entry],...(event.type==='complete'?{completedAt:now}:{})};
}
export function practiceReview(session) {
  const errors=session.events.filter(e=>e.type==='action'&&!e.ok);
  const hints=session.events.filter(e=>e.type==='hint').length;
  return {complete:Boolean(session.completedAt),score:session.completedAt?Math.max(0,100-errors.length*5-hints*3):null,hints,errorCount:errors.length,seconds:Math.max(0,Math.round(((session.completedAt??Date.now())-session.startedAt)/1000)),errors};
}

export function practiceErrorAdvice(message) {
  if(/侧板|主板上的部件/.test(message))return '先打开侧板并固定主板；拆卸时先移除主板上的部件。';
  if(/散热/.test(message))return '检查散热器是否固定到 CPU，并确认风扇连接到 CPU_FAN。';
  if(/存储/.test(message))return '分别检查 SATA 数据线与硬盘供电，两条通路都完整才能识别硬盘。';
  if(/供电|初始化/.test(message))return '区分主板 24-pin 与 CPU 8-pin，检查处理器、内存以及各自供电通路。';
  if(/接口/.test(message))return '按两端名称和防呆结构配对；主板供电、CPU 供电、风扇和 SATA 接口不能混接。';
  return '辨认部件方向标记与插槽缺口，确认安装前置步骤后再尝试。';
}
