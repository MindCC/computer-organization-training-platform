import { useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow, ReactFlowProvider, Background, Controls, Handle, Position, MarkerType, applyNodeChanges, useReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { api } from '../apiClient.js';
import { layoutMindMap, normalizeMindMap, removeMindMapNode, nodeLines, nodeHeight, mindMapSvg, MIND_MAP_COLORS, NODE_WIDTH, MAX_MIND_MAP_NODES } from '../mindMap.js';
import './mindMapBoard.css';

const EXAMPLE='计算机存储系统\n- Cache\n  - 命中率与命中时间\n  - 直接映射、全相联、组相联\n- 主存\n  - 地址与容量\n  - DRAM 与 SRAM\n- 外存\n  - SSD 与 HDD\n  - 速度、容量与成本';
const stamp=graph=>JSON.stringify(graph);
function MindNode({data,selected}) {
  const node=data.node;
  return <div className={`mind-node${selected?' is-selected':''}`} style={{borderColor:node.color,fontSize:node.fontSize,width:NODE_WIDTH,minHeight:nodeHeight(node)}}>
    <Handle type="target" position={Position.Left} />
    <span className="mind-node-stripe" style={{background:node.color}} />
    <span>{nodeLines(node).map((line,i)=><span className="mind-node-line" key={i}>{line || '\u00a0'}</span>)}</span>
    <Handle type="source" position={Position.Right} />
  </div>;
}
const nodeTypes={mind:MindNode};
function MapViewport({graph,selectedId,onSelect,onChange,onRelation,busy,epoch}) {
  const [nodes,setNodes]=useState([]);
  const viewportRef=useRef(null);
  const {fitView}=useReactFlow();
  useEffect(()=>setNodes(graph.nodes.map(n=>({id:n.id,type:'mind',position:{x:n.x,y:n.y},data:{node:n},selected:n.id===selectedId}))),[graph,selectedId]);
  useEffect(()=>{const timer=setTimeout(()=>fitView({padding:0.2,duration:200}),80);return ()=>clearTimeout(timer);},[epoch,fitView]);
  useEffect(()=>{
    let timer,lastWidth=0,lastHeight=0;
    const observer=new ResizeObserver(([entry])=>{
      const {width,height}=entry.contentRect;
      if(width===lastWidth && height===lastHeight)return;
      lastWidth=width;lastHeight=height;clearTimeout(timer);
      timer=setTimeout(()=>fitView({padding:0.2,duration:200}),100);
    });
    observer.observe(viewportRef.current);
    return ()=>{observer.disconnect();clearTimeout(timer);};
  },[fitView]);
  const edges=useMemo(()=>[
    ...graph.nodes.filter(n=>n.parentId).map(n=>({id:`tree-${n.id}`,source:n.parentId,target:n.id,type:'smoothstep',style:{stroke:n.color,strokeWidth:2},markerEnd:{type:MarkerType.ArrowClosed,color:n.color},selectable:false,deletable:false})),
    ...graph.relations.map(r=>({...r,type:'smoothstep',label:r.label,style:{stroke:'#64748b',strokeDasharray:'5 4'},labelStyle:{fontSize:12,fill:'#435b52'},markerEnd:{type:MarkerType.ArrowClosed,color:'#64748b'},selectable:false,deletable:false})),
  ],[graph]);
  return <div ref={viewportRef} className="mind-canvas" data-testid="mind-canvas" aria-label="可编辑思维导图画布">
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} minZoom={0.15} maxZoom={2.5} fitView nodesDraggable={!busy} nodesConnectable={!busy} deleteKeyCode={null}
      onNodesChange={changes=>setNodes(current=>applyNodeChanges(changes,current))}
      onNodeClick={(_event,node)=>onSelect(node.id)} onNodeDoubleClick={()=>document.getElementById('mind-node-label')?.focus()}
      onNodeDragStop={(_event,node)=>onChange({...graph,nodes:graph.nodes.map(n=>n.id===node.id?{...n,x:node.position.x,y:node.position.y}:n)})}
      onConnect={connection=>onRelation(connection.source,connection.target,'关联')}>
      <Background color="#d7e3de" gap={24} size={1} />
      <Controls showInteractive={false} fitViewOptions={{padding:0.2}} aria-label="画布缩放与适应" />
    </ReactFlow>
    <span className="mind-canvas-hint">拖动节点 · 滚轮／双指缩放 · 拖动连接点添加关系</span>
  </div>;
}
function readDraft(key) {try{return JSON.parse(localStorage.getItem(key));}catch{return null;}}
function downloadBlob(blob,name) {const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function exportMap(graph,format) {
  const svg=mindMapSvg(graph),name=graph.title.replace(/[\\/:*?"<>|]/g,'_')||'思维导图';
  if(format==='svg'){downloadBlob(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}),`${name}.svg`);return;}
  await document.fonts.ready;
  const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}));
  try{
    const image=new Image();image.src=url;await image.decode();
    // Large maps are scaled to a bounded image while retaining the complete graph.
    const scale=Math.min(2,8192/image.width,8192/image.height,Math.sqrt(24000000/(image.width*image.height)));
    const canvas=document.createElement('canvas');canvas.width=Math.ceil(image.width*scale);canvas.height=Math.ceil(image.height*scale);
    const context=canvas.getContext('2d');if(!context)throw new Error('浏览器无法创建导出画布');
    context.scale(scale,scale);context.drawImage(image,0,0);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('图片导出失败，请尝试 SVG');
    downloadBlob(blob,`${name}.png`);
  }finally{URL.revokeObjectURL(url);}
}

export function MindMapBoard({userId,initialText=''}) {
  const draftKey=`zcyl-mind-map-draft:${userId}`;
  const [initial]=useState(()=>{const draft=readDraft(draftKey);try{return draft?.graph?{...draft,graph:layoutMindMap(normalizeMindMap(draft.graph))}:null;}catch{return null;}});
  const [graph,setGraph]=useState(initial?.graph??null),[saved,setSaved]=useState(initial?.saved??null);
  const [savedStamp,setSavedStamp]=useState(initial?.savedStamp??'');
  const [past,setPast]=useState([]),[future,setFuture]=useState([]),[selectedId,setSelectedId]=useState(initial?.graph?.nodes[0]?.id??null);
  const [sourceMode,setSourceMode]=useState('text'),[text,setText]=useState(initialText),[image,setImage]=useState(null),[imageName,setImageName]=useState('');
  const [consent,setConsent]=useState(false),[caps,setCaps]=useState(null),[maps,setMaps]=useState([]),[listError,setListError]=useState('');
  const [busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[exporting,setExporting]=useState(false),[loading,setLoading]=useState(false);
  const [error,setError]=useState(''),[notice,setNotice]=useState(initial?'本机草稿已恢复，可继续编辑或保存。':''),[draftError,setDraftError]=useState(''),[epoch,setEpoch]=useState(0);
  const [relationSource,setRelationSource]=useState(''),[relationTarget,setRelationTarget]=useState(''),[relationLabel,setRelationLabel]=useState('');
  const [confirmDelete,setConfirmDelete]=useState(false);
  const fileRef=useRef(null), imageVersion=useRef(0), liveGraph=useRef(graph), liveStamp=useRef(savedStamp);
  liveGraph.current=graph;liveStamp.current=savedStamp;
  const dirty=Boolean(graph && stamp(graph)!==savedStamp),locked=busy||saving||loading;
  const selected=graph?.nodes.find(n=>n.id===selectedId);
  const [nodeText,setNodeText]=useState(selected?.label??'');
  useEffect(()=>setNodeText(selected?.label??''),[selectedId,selected?.label]);
  useEffect(()=>{if(graph && !graph.nodes.some(n=>n.id===selectedId))setSelectedId(graph.nodes.find(n=>n.parentId===null).id);},[graph,selectedId]);
  async function refreshList() {try{setMaps((await api.mindMaps()).maps??[]);setListError('');}catch(e){setListError(`画板列表加载失败：${e.message}`);}}
  useEffect(()=>{let cancelled=false;Promise.allSettled([api.mindMapCapabilities(),api.mindMaps()]).then(([a,b])=>{if(cancelled)return;if(a.status==='fulfilled')setCaps(a.value);else setError(`生成服务状态读取失败：${a.reason.message}`);if(b.status==='fulfilled')setMaps(b.value.maps??[]);else setListError(`画板列表加载失败：${b.reason.message}`);});return()=>{cancelled=true;imageVersion.current++;};},[]);
  useEffect(()=>{
    try {if(graph && dirty)localStorage.setItem(draftKey,JSON.stringify({graph,saved,savedStamp}));else localStorage.removeItem(draftKey);setDraftError('');}
    catch {setDraftError('浏览器无法保存本机草稿，请及时保存到账号或导出。');}
  },[graph,saved,savedStamp,dirty,draftKey]);
  useEffect(()=>{const handler=e=>{if(liveGraph.current && stamp(liveGraph.current)!==liveStamp.current){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler);},[]);
  function change(next) {
    if(locked)return;
    try{const normalized=layoutMindMap(normalizeMindMap(next));setPast(p=>[...p,graph].filter(Boolean).slice(-40));setFuture([]);setGraph(normalized);setError('');setConfirmDelete(false);}
    catch(e){setError(e.message);}
  }
  function replace(next,metadata=null) {setGraph(next);setSaved(metadata);setSavedStamp(metadata?stamp(next):'');setPast([]);setFuture([]);setSelectedId(next?.nodes[0]?.id??null);setEpoch(e=>e+1);setConfirmDelete(false);}
  function canReplace() {return !dirty || window.confirm('当前修改已留在本机草稿。继续将替换当前草稿，是否继续？');}
  async function generate(optimize=false) {
    if(locked || !consent)return;
    if(!optimize && !canReplace())return;
    setBusy(true);setError('');
    try{
      const result=await api.generateMindMap({text:optimize?'梳理结构、突出重点、按主题分类':text,image:!optimize && sourceMode==='image'?image:undefined,graph:optimize?graph:undefined,consent});
      const next=layoutMindMap(normalizeMindMap(result.graph));
      if(optimize){setPast(p=>[...p,graph].slice(-40));setFuture([]);setGraph(next);setSelectedId(next.nodes[0].id);setEpoch(e=>e+1);}
      else replace(next);
      setNotice(result.notice);
    }catch(e){setError(e.message);}finally{setBusy(false);}
  }
  async function selectImage(file) {
    const version=++imageVersion.current;
    setError('');setImage(null);setImageName('');
    if(!file)return;
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)){setError('仅支持 PNG、JPEG、WebP 图片');return;}
    if(file.size>5*1024*1024){setError('图片超过 5MB，请压缩后重试');return;}
    try{
      const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('无法读取图片'));reader.readAsDataURL(file);});
      const decoded=new Image();decoded.src=data;await decoded.decode();
      if(version===imageVersion.current){setImage(data);setImageName(file.name);}
    }catch(e){if(version===imageVersion.current)setError('图片无法打开，请选择有效图片');}
  }
  async function save(asNew=false) {
    if(!graph||locked)return;
    setSaving(true);setError('');
    try{const result=await api.saveMindMap(graph,asNew?null:saved);setSaved(result.map);setSavedStamp(stamp(graph));setNotice('已保存到当前账号，其他设备登录后可打开。');await refreshList();}
    catch(e){setError(`保存失败：${e.message}`);}finally{setSaving(false);}
  }
  async function open(id) {
    if(!id||locked||!canReplace())return;
    setLoading(true);setError('');
    try{const {map}=await api.mindMap(id);replace(layoutMindMap(normalizeMindMap(map.graph)),map);setNotice('已打开账号中的画板。');}
    catch(e){setError(`打开失败：${e.message}`);}finally{setLoading(false);}
  }
  async function deleteSaved() {
    if(!saved||locked)return;
    setSaving(true);setError('');
    try{await api.deleteMindMap(saved.id);replace(null);setNotice('画板已删除。');await refreshList();}
    catch(e){setError(`删除失败：${e.message}`);}finally{setSaving(false);}
  }
  function updateNode(patch) {change({...graph,nodes:graph.nodes.map(n=>n.id===selectedId?{...n,...patch}:n)});}
  function addChild() {
    const id=`node-${crypto.randomUUID()}`;
    const x=selected.x+290;let y=selected.y;
    for(let i=0;i<graph.nodes.length;i++) {
      const overlap=graph.nodes.find(n=>x<n.x+NODE_WIDTH+20 && x+NODE_WIDTH+20>n.x && y<n.y+nodeHeight(n)+24 && y+82>n.y);
      if(!overlap)break;y=overlap.y+nodeHeight(overlap)+24;
    }
    change({...graph,nodes:[...graph.nodes,{id,label:'新知识点',parentId:selectedId,color:selected.parentId===null?MIND_MAP_COLORS[graph.nodes.filter(n=>n.parentId===selected.id).length%MIND_MAP_COLORS.length]:selected.color,fontSize:16,x,y}]});setSelectedId(id);
  }
  function addRelation(source,target,label) {if(!source||!target)return;change({...graph,relations:[...graph.relations,{id:`r-${Date.now()}`,source,target,label:label.trim()||'关联'}]});}
  function undo() {if(!past.length||locked)return;setFuture(f=>[graph,...f]);setGraph(past.at(-1));setPast(p=>p.slice(0,-1));}
  function redo() {if(!future.length||locked)return;setPast(p=>[...p,graph]);setGraph(future[0]);setFuture(f=>f.slice(1));}
  async function handleExport(format) {setExporting(true);setError('');try{await exportMap(graph,format);}catch(e){setError(e.message);}finally{setExporting(false);}}

  return <section className="mind-board" aria-label="思维画板">
    <header className="mind-heading"><div><span className="kb-breadcrumb">我的知识库 / 思维画板</span><h1>把知识，连成一张图</h1><p>从照片或一段文字开始，整理结构，再自由编辑。</p></div><span className="mind-count">{graph?`${graph.nodes.length} 个节点`:'可编辑 · 可保存 · 可导出'}</span></header>
    <div className="mind-library"><label>我的画板<select aria-label="打开已保存画板" value={saved?.id??''} disabled={locked} onChange={e=>open(e.target.value)}><option value="">{maps.length?'选择已保存画板':'暂无已保存画板'}</option>{maps.map(m=><option value={m.id} key={m.id}>{m.title}</option>)}</select></label><button type="button" disabled={locked} onClick={()=>{if(canReplace()){replace(null);setNotice('');}}}>新建画板</button>{listError?<span role="alert">{listError}<button onClick={refreshList}>重试列表</button></span>:null}</div>
    <details className="mind-source" open={!graph || Boolean(initialText) || undefined}>
      <summary>{graph?'生成新导图 / 更换素材':'选择素材，生成导图'}</summary>
      <div className="mind-source-inner">
        <div className="mind-source-tabs" role="tablist" aria-label="生成素材"><button role="tab" aria-selected={sourceMode==='text'} disabled={locked} onClick={()=>setSourceMode('text')}>文字生成</button><button role="tab" aria-selected={sourceMode==='image'} disabled={locked} onClick={()=>setSourceMode('image')}>图片转导图</button></div>
        {sourceMode==='text'?<><label className="mind-text-label" htmlFor="mind-input">输入主题、需求或有缩进的提纲</label><textarea id="mind-input" aria-label="导图文字素材" placeholder="例如：帮我梳理 Cache 与主存的知识结构，说明命中率、映射方式和写策略的关系。" value={text} maxLength={6000} disabled={locked} onChange={e=>setText(e.target.value)} /><div className="mind-input-foot"><button type="button" disabled={locked} onClick={()=>setText(EXAMPLE)}>填入存储系统示例</button><small>{text.length} / 6000</small></div></>:<div className="mind-drop" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!locked)selectImage(e.dataTransfer.files?.[0]);}}>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" aria-label="选择思维导图图片" disabled={locked} onChange={e=>selectImage(e.target.files?.[0])} />
          {image?<div className="mind-image-preview"><img src={image} alt="所选导图原图" /><span>{imageName}</span><button disabled={locked} onClick={()=>{imageVersion.current++;setImage(null);setImageName('');if(fileRef.current)fileRef.current.value='';}}>移除图片</button></div>:<p>选择或拖入教材照片、手绘图、旧导图<br/><small>PNG / JPEG / WebP，最多 5MB</small></p>}
          {caps && !caps.imageAi?<p className="mind-provider-note">图片识别尚未配置视觉模型，可先使用文字生成。</p>:null}
          <label>补充要求<input aria-label="图片补充要求" value={text} maxLength={6000} disabled={locked} placeholder="例如：按主题配色，突出重点" onChange={e=>setText(e.target.value)} /></label>
        </div>}
        <div className="mind-generate-row"><label className="mind-consent"><input type="checkbox" checked={consent} disabled={locked} onChange={e=>setConsent(e.target.checked)} />生成时，仅将我填写的文字、所选图片或当前导图发送给配置的 AI 服务。</label><button className="mind-primary" type="button" disabled={locked||!consent||!caps||(sourceMode==='image'?(!image||!caps.imageAi):!text.trim())} onClick={()=>generate()}>{busy?'正在生成…':caps?.textAi||sourceMode==='image'?'AI 生成导图':'整理成导图'}</button></div>
        {caps && !caps.textAi && sourceMode==='text'?<p className="mind-provider-note">当前使用本地提纲整理，可识别缩进层级；配置 AI 后可按自然语言生成知识结构。</p>:null}
      </div>
    </details>
    {error?<p className="mind-error" role="alert">{error}</p>:null}
    {notice?<p className="mind-notice" role="status">{notice}</p>:null}
    {draftError?<p className="mind-error" role="alert">{draftError}</p>:null}
    {graph?<>
      <div className="mind-toolbar"><label className="mind-title">画板名称<input aria-label="画板名称" value={graph.title} maxLength={80} disabled={locked} onChange={e=>change({...graph,title:e.target.value})} /></label><div className="mind-actions"><button disabled={!past.length||locked} onClick={undo}>撤销</button><button disabled={!future.length||locked} onClick={redo}>重做</button><button disabled={locked} onClick={()=>{change(layoutMindMap(graph,{force:true}));setEpoch(e=>e+1);}}>自动布局</button><button disabled={locked||!consent||!caps} title={!consent?'请先勾选发送素材的确认':''} onClick={()=>generate(true)}>{caps?.textAi?'AI 重绘优化':'重排与配色'}</button><button className="mind-primary" disabled={locked||!dirty} onClick={()=>save()}>{saving?'正在保存…':'保存画板'}</button><button disabled={locked} onClick={()=>save(true)}>另存为</button><button disabled={exporting||locked} onClick={()=>handleExport('png')}>{exporting?'正在导出…':'导出 PNG'}</button><button disabled={exporting||locked} onClick={()=>handleExport('svg')}>导出 SVG</button></div><small className="mind-save-status">{dirty?'有未保存修改 · 本机草稿':'已保存到账号'}</small></div>
      <label className="mind-consent mind-optimize-consent"><input type="checkbox" checked={consent} disabled={locked} onChange={e=>setConsent(e.target.checked)} />允许重绘时将当前导图发送给配置的 AI 服务。</label>
      <div className="mind-editor"><ReactFlowProvider><MapViewport graph={graph} selectedId={selectedId} onSelect={setSelectedId} onChange={change} onRelation={addRelation} busy={locked} epoch={epoch} /></ReactFlowProvider>
        <aside className="mind-inspector" aria-label="节点编辑"><h2>节点与关系</h2><label>选择节点<select aria-label="选择编辑节点" value={selected?.id??''} onChange={e=>{setSelectedId(e.target.value);setConfirmDelete(false);}}>{graph.nodes.map(n=><option key={n.id} value={n.id}>{n.label}</option>)}</select></label>
          {selected?<fieldset disabled={locked}><label>节点文字<textarea id="mind-node-label" aria-label="节点文字" maxLength={160} value={nodeText} onChange={e=>{setNodeText(e.target.value);if(e.target.value.trim())updateNode({label:e.target.value});}} onBlur={()=>{if(!nodeText.trim()){setNodeText(selected.label);setError('节点文字不能为空');}}} /></label><div className="mind-style-row"><label>颜色<input type="color" aria-label="节点颜色" value={selected.color} onChange={e=>updateNode({color:e.target.value})} /></label><label>字号<select aria-label="节点字号" value={selected.fontSize} onChange={e=>updateNode({fontSize:Number(e.target.value)})}>{Array.from({length:13},(_,i)=>i+12).map(size=><option value={size} key={size}>{size}px</option>)}</select></label></div>
            {selected.parentId!==null?<label>所属节点<select aria-label="节点所属分支" value={selected.parentId} onChange={e=>updateNode({parentId:e.target.value})}>{graph.nodes.filter(n=>n.id!==selected.id).map(n=><option key={n.id} value={n.id}>{n.label}</option>)}</select></label>:null}
            <button disabled={graph.nodes.length>=MAX_MIND_MAP_NODES} onClick={addChild}>＋ 添加子节点</button>
            {selected.parentId!==null?<button className="mind-danger" onClick={()=>{if(window.confirm('删除此节点及其所有子节点、关联箭头？')){change(removeMindMapNode(graph,selectedId));setSelectedId(graph.nodes[0].id);}}}>删除节点及子节点</button>:null}
          </fieldset>:null}
          <details className="mind-relations"><summary>关系箭头 · {graph.relations.length}</summary><fieldset disabled={locked}><label>起点<select aria-label="关系起点" value={relationSource} onChange={e=>setRelationSource(e.target.value)}><option value="">选择节点</option>{graph.nodes.map(n=><option key={n.id} value={n.id}>{n.label}</option>)}</select></label><label>终点<select aria-label="关系终点" value={relationTarget} onChange={e=>setRelationTarget(e.target.value)}><option value="">选择节点</option>{graph.nodes.map(n=><option key={n.id} value={n.id}>{n.label}</option>)}</select></label><label>关系说明<input aria-label="关系说明" maxLength={60} value={relationLabel} onChange={e=>setRelationLabel(e.target.value)} placeholder="例如：交换数据" /></label><button disabled={!relationSource||!relationTarget||relationSource===relationTarget} onClick={()=>addRelation(relationSource,relationTarget,relationLabel)}>添加关系箭头</button>
            {graph.relations.map(r=><div className="mind-relation" key={r.id}><small>{graph.nodes.find(n=>n.id===r.source)?.label} → {graph.nodes.find(n=>n.id===r.target)?.label}</small><input aria-label={`编辑关系 ${r.label}`} value={r.label} maxLength={60} onChange={e=>change({...graph,relations:graph.relations.map(item=>item.id===r.id?{...item,label:e.target.value}:item)})} /><button className="mind-danger" aria-label={`删除关系 ${r.label}`} onClick={()=>change({...graph,relations:graph.relations.filter(item=>item.id!==r.id)})}>删除箭头</button></div>)}
          </fieldset></details>
        </aside>
      </div>
      {saved?<div className="mind-delete">{confirmDelete?<><span>删除账号中保存的画板和当前草稿？</span><button className="mind-danger" disabled={locked} onClick={deleteSaved}>确认删除画板</button><button disabled={locked} onClick={()=>setConfirmDelete(false)}>取消</button></>:<button className="mind-danger" disabled={locked} onClick={()=>setConfirmDelete(true)}>删除已保存画板</button>}</div>:null}
    </>:<div className="mind-empty"><div className="mind-empty-map" aria-hidden="true"><span>中心主题</span><i/><div><span>知识分支</span><span>知识分支</span><span>知识分支</span></div></div><h2>先放进素材，再把想法展开</h2><p>生成后可编辑每个节点的文字、颜色与字号，添加节点和关系箭头。</p></div>}
  </section>;
}
