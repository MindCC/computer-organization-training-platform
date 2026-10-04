import { thumbnailForDemo, thumbnailForExperiment } from '../experimentThumbnails.js';
import './experimentThumbnail.css';

function NodeShape({ node }) {
  const {type} = node;
  if (type === 'input' || type === 'output') return <circle r="13" className={type} />;
  if (['and','nand'].includes(type)) return <><path d="M-27-18H-7A18 18 0 0 1-7 18H-27Z"/>{type==='nand'&&<circle cx="16" r="4"/>}</>;
  if (['or','xor'].includes(type)) return <><path d="M-27-18Q3-18 24 0Q3 18-27 18Q-8 0-27-18Z"/>{type==='xor'&&<path d="M-34-18Q-15 0-34 18"/>}</>;
  if (type === 'not') return <><path d="M-22-18L16 0-22 18Z"/><circle cx="21" r="4"/></>;
  if (type === 'mux2') return <path d="M-28-23L28-15V15L-28 23Z"/>;
  if (type.startsWith('alu') || type === 'fullAdder') return <path d="M-29-22H29L20 22H-20L-29 7L-17 0-29-7Z"/>;
  return <rect x="-33" y="-19" width="66" height="38" rx={type.includes('Memory')||type.includes('Rom')?2:6}/>;
}

function CircuitPicture({ thumbnail }) {
  const positions = new Map(thumbnail.nodes.map(node => [node.id,node.position]));
  const minX = Math.min(...thumbnail.nodes.map(node => node.position.x))-48;
  const minY = Math.min(...thumbnail.nodes.map(node => node.position.y))-43;
  const width = Math.max(...thumbnail.nodes.map(node => node.position.x))-minX+48;
  const height = Math.max(...thumbnail.nodes.map(node => node.position.y))-minY+43;
  const viewHeight = Math.max(height,width*.44);
  const top = minY-(viewHeight-height)/2;
  return <svg viewBox={[minX,top,width,viewHeight].join(' ')} aria-hidden="true">
    <g className="thumbnail-wires">{thumbnail.edges.map(edge => {
      const from=positions.get(edge.from.nodeId),to=positions.get(edge.to.nodeId);
      if(!from||!to)return null;
      const start=from.x+34,end=to.x-34,mid=(start+end)/2;
      return <path key={edge.id} d={'M'+start+' '+from.y+'H'+mid+'V'+to.y+'H'+end}/>;
    })}</g>
    <g className="thumbnail-nodes">{thumbnail.nodes.map(node => <g key={node.id} transform={'translate('+node.position.x+' '+node.position.y+')'}>
      <NodeShape node={node}/><text y={['input','output'].includes(node.type)?-22:-28}>{node.label}</text>
      {['input','output'].includes(node.type)&&<text className="thumbnail-bit" y="5">{thumbnail.sample?.inputs?.[node.id+'.out']??thumbnail.sample?.expected?.[node.id+'.in']??(node.type==='input'?'→':'●')}</text>}
    </g>)}</g>
  </svg>;
}

function HardwarePicture({ targets }) {
  const capacity=targets.storageCapacity>=1024?(targets.storageCapacity/1024)+' TB':targets.storageCapacity+' GB';
  return <svg viewBox="0 0 260 145" aria-hidden="true">
    <g className="thumbnail-parts">
      <rect className="thumbnail-board" x="16" y="12" width="135" height="116" rx="6"/>
      <path d="M31 105H136M31 115H114M41 30V83H113M52 20V68H128" className="thumbnail-traces"/>
      <rect x="39" y="39" width="45" height="45" rx="3"/><rect x="44" y="44" width="35" height="35" rx="3"/>
      <text x="61" y="65">CPU</text>
      <rect x="105" y="24" width="12" height="71" rx="2"/><rect x="123" y="24" width="12" height="71" rx="2"/>
      {[34,49,64,79].map(y=><g key={y}><rect x="107" y={y} width="8" height="9"/><rect x="125" y={y} width="8" height="9"/></g>)}
      <rect x="169" y="20" width="74" height="86" rx="6"/>
      {targets.storageSpeed<70?<><circle cx="206" cy="54" r="23"/><circle cx="206" cy="54" r="6"/><path d="M221 78L207 57"/></>:<><rect x="182" y="31" width="48" height="19" rx="3"/><rect x="182" y="58" width="18" height="18"/><rect x="211" y="58" width="18" height="18"/></>}
      <text x="206" y="96">{targets.storageSpeed<70?'HDD':'SSD'}</text>
      <text x="84" y="141">{targets.memory} GB 内存</text><text x="206" y="123">{capacity}</text>
    </g>
  </svg>;
}

/** A static teaching miniature; progress remains on the surrounding entry. */
export function ExperimentThumbnail({ challengeId, demo, className='' }) {
  const thumbnail=demo?thumbnailForDemo(demo.href??demo):thumbnailForExperiment(challengeId);
  if(!thumbnail)return null;
  return <span className={'experiment-thumbnail '+thumbnail.kind+' '+className} role="img" aria-label={thumbnail.description} data-thumbnail-id={thumbnail.id}>
    {thumbnail.kind==='hardware'?<HardwarePicture targets={thumbnail.targets}/>:<CircuitPicture thumbnail={thumbnail}/>}
    <span className="experiment-thumbnail-caption">{thumbnail.kind==='hardware'?'配置目标 · ¥'+thumbnail.targets.budget:thumbnail.sampleLabel??thumbnail.sample?.name??'信号通路'}</span>
  </span>;
}
