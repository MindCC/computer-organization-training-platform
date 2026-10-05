import { useEffect, useState } from 'react';
import { ReactFlow, Background, Controls, Handle, Position, MarkerType, applyNodeChanges } from '@xyflow/react';
import { TASK_TYPES } from '../../../shared/classroomTaskChain.js';
import { positionOf, dragTaskStage, connectTaskStages, arrangeStages } from '../../../shared/taskWorkflow.js';
import '@xyflow/react/dist/style.css';
function TaskNode({data,selected}){
  return <div className={`task-workflow-node${selected?' selected':''}`} data-stage-id={data.stage.id}>
    <Handle type="target" position={Position.Left} id="in"/>
    <header><span className={`chain-step-number type-${data.stage.type}`}>{data.index+1}</span><small>{TASK_TYPES[data.stage.type]?.label} · {data.stage.minutes} 分钟</small></header>
    <strong>{data.stage.title||'未命名任务'}</strong><p>{data.stage.instructions||'点击节点设置内容'}</p>
    <Handle type="source" position={Position.Right} id="out"/>
  </div>;
}
const nodeTypes={task:TaskNode};
export function TaskWorkflowCanvas({stages,selected,onSelect,onChange}){
  const build=()=>stages.map((stage,index)=>({id:stage.id,type:'task',position:positionOf(stage,index),selected:stage.id===selected,data:{stage,index}}));
  const [nodes,setNodes]=useState(build);
  useEffect(()=>setNodes(build()),[stages,selected]);
  const edges=stages.slice(1).map((stage,index)=>({id:`${stages[index].id}-${stage.id}`,source:stages[index].id,target:stage.id,sourceHandle:'out',targetHandle:'in',type:'smoothstep',markerEnd:{type:MarkerType.ArrowClosed},style:{stroke:'#3b9d87',strokeWidth:2},selectable:false}));
  return <div className="task-workflow-wrap"><div className="task-workflow-toolbar"><small>箭头表示完成顺序。左右拖动节点或连接圆点可调整顺序。</small><button type="button" className="ghost-button" onClick={()=>onChange(arrangeStages(stages))}>整理节点</button></div>
    <div className="task-workflow-canvas" aria-label="任务工作流画布">
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={changes=>setNodes(current=>applyNodeChanges(changes,current))}
        onNodeClick={(_,node)=>onSelect(node.id)} onNodeDragStop={(_,node)=>onChange(dragTaskStage(stages,node.id,node.position))}
        onConnect={({source,target})=>onChange(connectTaskStages(stages,source,target))}
        deleteKeyCode={null} fitView fitViewOptions={{padding:.15,maxZoom:1,nodes:stages.slice(0,3).map(stage=>({id:stage.id}))}} minZoom={.15} maxZoom={1.8} proOptions={{hideAttribution:true}}>
        <Background gap={20} size={1} color="#c7d9d5"/><Controls showInteractive={false}/>
      </ReactFlow>
    </div>
    <details className="chain-outline"><summary>任务顺序 · {stages.length} 个节点</summary><ol className="chain-stage-list">{stages.map((stage,index)=><li key={stage.id}><button type="button" aria-pressed={stage.id===selected} onClick={()=>onSelect(stage.id)}><span className={`chain-step-number type-${stage.type}`}>{index+1}</span><strong>{stage.title}</strong></button></li>)}</ol></details>
  </div>;
}
