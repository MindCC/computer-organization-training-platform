export const MIND_MAP_COLORS = ['#287d68', '#457ac0', '#ad7540', '#9366b3', '#bc627f', '#438d98'];
export const MAX_MIND_MAP_NODES = 80;
export const NODE_WIDTH = 210;

function invalid(message) { throw new Error(message); }
export function normalizeMindMap(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.nodes) || !value.nodes.length || value.nodes.length > MAX_MIND_MAP_NODES) invalid('导图须包含 1–80 个节点');
  const nodes = value.nodes.map(n => {
    if (!n || typeof n.id !== 'string' || !/^[\w-]{1,60}$/.test(n.id) || typeof n.label !== 'string' || !n.label.trim() || n.label.length > 160) invalid('节点标识或文字无效（文字最多 160 字）');
    if (n.parentId != null && typeof n.parentId !== 'string') invalid('父节点标识无效');
    const node = { id:n.id, label:n.label.trim(), parentId:n.parentId ?? null, fontSize:Math.round(Math.min(24, Math.max(12, Number(n.fontSize) || 16))) };
    if (/^#[0-9a-f]{6}$/i.test(n.color ?? '')) node.color = n.color;
    if (Number.isFinite(n.x) && Number.isFinite(n.y) && Math.abs(n.x) <= 20000 && Math.abs(n.y) <= 20000) { node.x=n.x; node.y=n.y; }
    return node;
  });
  const byId = new Map(nodes.map(n => [n.id,n]));
  if (byId.size !== nodes.length) invalid('节点标识重复');
  const roots = nodes.filter(n => n.parentId === null);
  if (roots.length !== 1) invalid('导图须有且只有一个中心节点');
  const root = roots[0];
  for (const node of nodes) {
    let current=node, depth=0;
    const seen=new Set();
    while (current.parentId !== null) {
      if (seen.has(current.id) || ++depth > 8) invalid('节点存在循环或层级超过 8 层');
      seen.add(current.id);
      current=byId.get(current.parentId);
      if (!current) invalid('父节点不存在');
    }
    if (current.id !== root.id) invalid('节点没有连接到中心');
  }
  root.color ??= '#286f5c';
  let branch=0;
  const colorize = node => {
    if (!node.color) { const parent=byId.get(node.parentId); if (parent.id===root.id) node.color=MIND_MAP_COLORS[branch++ % MIND_MAP_COLORS.length]; else { colorize(parent); node.color=parent.color; } }
  };
  nodes.filter(n => n.id !== root.id).forEach(colorize);
  if (value.relations != null && (!Array.isArray(value.relations) || value.relations.length > 120)) invalid('关系箭头最多 120 条');
  const relations=(value.relations ?? []).map((r,i) => {
    if (!r || !byId.has(r.source) || !byId.has(r.target) || r.source===r.target || (r.label != null && (typeof r.label !== 'string' || r.label.length > 60))) invalid('关系箭头无效');
    return { id:`relation-${i}`, source:r.source, target:r.target, label:r.label?.trim() || '关联' };
  });
  return { title: typeof value.title === 'string' && value.title.trim() ? value.title.trim().slice(0,80) : root.label.slice(0,80), nodes, relations };
}

export function nodeLines(node) {
  const count = Math.max(8, Math.floor((NODE_WIDTH-32)/node.fontSize));
  return node.label.split('\n').flatMap(line => Array.from({length: Math.max(1,Math.ceil([...line].length/count))}, (_,i) => [...line].slice(i*count,(i+1)*count).join('')));
}
export function nodeHeight(node) { return Math.max(58, nodeLines(node).length * (node.fontSize+7) + 24); }

export function layoutMindMap(graph, { force=false } = {}) {
  const children = id => graph.nodes.filter(n => n.parentId === id);
  const sizes=new Map();
  const root=graph.nodes.find(n => n.parentId===null);
  function measure(node) { const kids=children(node.id); const size=Math.max(nodeHeight(node)+32, kids.reduce((sum,n) => sum+measure(n),0)); sizes.set(node.id,size); return size; }
  measure(root);
  const positions=new Map();
  function place(node, depth, top) {
    positions.set(node.id,{x:depth*290,y:top+sizes.get(node.id)/2-nodeHeight(node)/2});
    let nextTop=top;
    children(node.id).forEach(n => {place(n,depth+1,nextTop);nextTop+=sizes.get(n.id);});
  }
  place(root,0,0);
  return {...graph,nodes:graph.nodes.map(n => ({...n,...(!force && Number.isFinite(n.x) && Number.isFinite(n.y) ? {x:n.x,y:n.y} : positions.get(n.id))}))};
}
export function removeMindMapNode(graph,id) {
  if (graph.nodes.find(n => n.id===id)?.parentId===null) invalid('中心节点不能删除');
  const removed=new Set([id]);
  for(let i=0;i<graph.nodes.length;i++) graph.nodes.forEach(n => {if(removed.has(n.parentId))removed.add(n.id);});
  return {...graph,nodes:graph.nodes.filter(n => !removed.has(n.id)),relations:graph.relations.filter(r => !removed.has(r.source) && !removed.has(r.target))};
}
const xml = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]));
export function mindMapSvg(graph) {
  const map=layoutMindMap(normalizeMindMap(graph));
  const minX=Math.min(...map.nodes.map(n => n.x))-45, minY=Math.min(...map.nodes.map(n => n.y))-80;
  const width=Math.max(...map.nodes.map(n => n.x+NODE_WIDTH))-minX+45, height=Math.max(...map.nodes.map(n => n.y+nodeHeight(n)))-minY+45;
  const byId=new Map(map.nodes.map(n => [n.id,n]));
  const path = (a,b,color,dashed=false,label='') => {
    const x1=a.x+NODE_WIDTH,y1=a.y+nodeHeight(a)/2,x2=b.x,y2=b.y+nodeHeight(b)/2,m=(x1+x2)/2;
    return `<path d="M${x1},${y1} C${m},${y1} ${m},${y2} ${x2},${y2}" fill="none" stroke="${color}" stroke-width="2" ${dashed?'stroke-dasharray="6 4"':''} marker-end="url(#arrow)"/>${label?`<text x="${m}" y="${(y1+y2)/2-8}" text-anchor="middle" font-size="13" fill="#435b52" stroke="#fff" stroke-width="4" paint-order="stroke">${xml(label)}</text>`:''}`;
  };
  const edges=map.nodes.filter(n => n.parentId).map(n => path(byId.get(n.parentId),n,n.color)).join('')+map.relations.map(r => path(byId.get(r.source),byId.get(r.target),'#64748b',true,r.label)).join('');
  const nodes=map.nodes.map(n => `<g><rect x="${n.x}" y="${n.y}" width="${NODE_WIDTH}" height="${nodeHeight(n)}" rx="10" fill="#fff" stroke="${n.color}" stroke-width="2"/><rect x="${n.x}" y="${n.y+12}" width="4" height="${nodeHeight(n)-24}" rx="2" fill="${n.color}"/><text font-size="${n.fontSize}" fill="#243d37">${nodeLines(n).map((line,i) => `<tspan x="${n.x+16}" y="${n.y+24+i*(n.fontSize+7)}">${xml(line)}</tspan>`).join('')}</text></g>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(width)}" height="${Math.ceil(height)}" viewBox="${minX} ${minY} ${width} ${height}"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="#64748b"/></marker></defs><rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#fff"/><g font-family="Arial, Microsoft YaHei, sans-serif"><text x="${minX+45}" y="${minY+35}" font-size="22" fill="#243d37">${xml(map.title)}</text>${edges}${nodes}</g></svg>`;
}
