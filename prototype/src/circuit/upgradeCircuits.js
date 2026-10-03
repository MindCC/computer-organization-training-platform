import { booleanCases } from './curriculumCircuits.js';

const p = (id,direction,width=1,label=id) => ({id,label,direction,signal:width===1?'bit':'word',width});
const link = (from,to) => ({id:`${from}->${to}`,from:{nodeId:from.split('.')[0],portId:from.split('.')[1]},to:{nodeId:to.split('.')[0],portId:to.split('.')[1]},hint:{type:'通路未完成',message:`检查 ${to} 的输入来源。`}});
const n = (id,type,label,x,y,ports) => ({id,type,label,position:{x,y},ports});
function control(node,min,max,width,options){node.inputControl={min,max,options};node.ports[0].signal='word';node.ports[0].width=width;}
function width(node,id,bits){const port=node.ports.find(p=>p.id===id);port.width=bits;port.signal=bits===1?'bit':'word';}
function fullCoverage(model,inputs,outputs,evaluate){
  const all=booleanCases(inputs,outputs,evaluate);
  const key=t=>JSON.stringify(Object.entries(t.inputs).sort());
  const publicKeys=new Set(model.testCases.map(key));
  model.hiddenTestCases=all.filter(t=>!publicKeys.has(key(t)));
}

export function upgradeCircuits(models){
  const get=id=>models.find(m=>m.id===id);
  const program=get('program-flow');
  control(program.nodes[0],0,7,4);program.nodes[0].ports[0].label='x';
  program.nodes.find(n=>n.id==='cpu-fetch').label='固定程序 ADD1 通路';
  program.nodes.find(n=>n.id==='execute-unit').type='increment';
  program.nodes.at(-1).ports[0].label='x+1';
  program.nodes.filter(n=>n.type!=='input').forEach(n=>n.ports.forEach(port=>width(n,port.id,4)));
  program.goal='沿固定程序 ADD1 的简化通路传送输入 x，并观察实际结果 x+1；本关不模拟完整指令周期。';
  program.testCases=[0,1,7].map(x=>({name:`${x}+1=${x+1}`,inputs:{'keyboard-input.out':x},expected:{'screen-output.in':x+1}}));
  program.hiddenTestCases=[2,3,4,5,6].map(x=>({name:`${x}+1=${x+1}`,inputs:{'keyboard-input.out':x},expected:{'screen-output.in':x+1}}));
  program.nodes.find(n=>n.id==='cpu-fetch').ports[0].label='数据';program.nodes.find(n=>n.id==='cpu-fetch').ports[1].label='操作数';
  get('data-flow').hiddenTestCases=[];

  const enc=get('machine-number');
  control(enc.nodes[0],-7,7,4);enc.nodes[0].ports[0].label='整数';
  for(const [id,type] of [['sign-split','signOf'],['magnitude-split','signMagnitude'],['ones-encoder','ones4'],['twos-encoder','twos4']])enc.nodes.find(n=>n.id===id).type=type;
  enc.nodes.find(n=>n.id==='magnitude-split').label='原码生成器';
  enc.nodes.find(n=>n.id==='magnitude-split').ports[0].label='整数';
  enc.nodes.find(n=>n.id==='magnitude-split').ports[1].label='原码';
  enc.nodes.forEach(n=>n.ports.forEach(port=>width(n,port.id,n.id==='sign-output'||(n.id==='sign-split'&&port.id==='out')?1:4)));
  const encode=x=>({name:`${x} 编码路径`,inputs:{'decimal-input.out':x},expected:{'machine-output.in':(x+16)%16,'sign-output.in':Number(x<0)}});
  enc.testCases=[-5,5,0,-7,7].map(encode);enc.hiddenTestCases=Array.from({length:15},(_,i)=>i-7).filter(x=>![-5,5,0,-7,7].includes(x)).map(encode);

  for(const id of ['memory-address','system-bus']){
    const m=get(id),memory=m.nodes.find(n=>n.id===(id==='memory-address'?'memory-cell':'main-memory'));
    const address=id==='memory-address'?'address-input':'cpu-address',read=id==='memory-address'?'read-signal':'rw-control';
    control(m.nodes.find(n=>n.id===address),100,103,7);
    const addressBuffer=m.nodes.find(n=>n.id===(id==='memory-address'?'mar':'address-bus'));
    addressBuffer.ports.forEach(port=>width(addressBuffer,port.id,7));
    memory.type='teachingMemory';memory.ports=[p('in','in',7,'地址'),p('read','in',1,'Read'),p('out','out',4,'有效数据')];
    m.requiredEdges.push(link(id==='memory-address'?`${read}.out`:'control-bus.out',`${memory.id}.read`));
    m.nodes.filter(n=>['mdr','cpu-data-bus','data-bus','cpu-data-in'].includes(n.id)).forEach(n=>n.ports.forEach(port=>width(n,port.id,4)));
    m.testCases=[{name:'读取地址100',inputs:{[`${address}.out`]:100,[`${read}.out`]:1},expected:{[id==='memory-address'?'cpu-data-bus.in':'cpu-data-in.in']:5,'read-observe.in':1}},{name:'未发读命令',inputs:{[`${address}.out`]:100,[`${read}.out`]:0},expected:{[id==='memory-address'?'cpu-data-bus.in':'cpu-data-in.in']:0,'read-observe.in':0}}];
    m.hiddenTestCases=[100,101,102,103].flatMap((a,k)=>[0,1].map(r=>({name:`地址${a},Read=${r}`,inputs:{[`${address}.out`]:a,[`${read}.out`]:r},expected:{[id==='memory-address'?'cpu-data-bus.in':'cpu-data-in.in']:r?[5,9,2,12][k]:0,'read-observe.in':r}}))).filter(t=>t.inputs[`${address}.out`]!==100);
    m.goal+=' 教学 ROM 为 100→5、101→9、102→2、103→12；Read=0 时有效数据输出为 0，本关不执行写入。';
  }
  const instruction=get('instruction-data');
  for(const id of ['program-counter','data-address'])control(instruction.nodes.find(n=>n.id===id),100,103,7);
  for(const id of ['instruction-memory','data-memory']){
    const node=instruction.nodes.find(n=>n.id===id);node.type='contentRom';node.label=id==='instruction-memory'?'教学 ROM 指令通路':'教学 ROM 数据通路';width(node,'in',7);width(node,'out',4);
  }
  instruction.nodes.filter(n=>['instruction-register','operand-register','instruction-view','data-view'].includes(n.id)).forEach(n=>n.ports.forEach(port=>width(n,port.id,4)));
  instruction.testCases=[{name:'同址不同解释',inputs:{'program-counter.out':100,'data-address.out':100},expected:{'instruction-view.in':3,'data-view.in':3}},{name:'取指与取数',inputs:{'program-counter.out':100,'data-address.out':101},expected:{'instruction-view.in':3,'data-view.in':5}}];
  instruction.hiddenTestCases=[100,101,102,103].flatMap((a,i)=>[100,101,102,103].map((b,j)=>({name:`取指${a} / 取数${b}`,inputs:{'program-counter.out':a,'data-address.out':b},expected:{'instruction-view.in':[3,5,9,12][i],'data-view.in':[3,5,9,12][j]}})));
  instruction.hiddenTestCases=instruction.hiddenTestCases.filter(t=>!instruction.testCases.some(p=>p.inputs['program-counter.out']===t.inputs['program-counter.out']&&p.inputs['data-address.out']===t.inputs['data-address.out']));
  instruction.nodes.find(n=>n.id==='instruction-register').ports[1].label='指令字';

  const io=get('io-transfer'),gate=io.nodes.find(n=>n.id==='cpu-data-bus');
  gate.type='and';gate.label='就绪传送门';gate.ports=[p('a','in',1,'数据'),p('b','in',1,'Ready'),p('c','out',1,'有效数据')];
  io.requiredEdges=io.requiredEdges.map(e=>e.to.nodeId===gate.id?{...e,to:{...e.to,portId:'a'}}:e.from.nodeId===gate.id?{...e,from:{...e.from,portId:'c'}}:e);
  io.requiredEdges.push(link('io-status.out','cpu-data-bus.b'));
  io.testCases[1].expected['memory-buffer.in']=0;
  fullCoverage(io,['input-device','io-status'],['memory-buffer','poll-observe'],([d,r])=>[d&r,r]);

  const fa=get('full-adder'),carry=fa.nodes.find(n=>n.id==='carry-logic');
  carry.type='or';carry.label='合并进位';carry.ports=[p('a','in'),p('b','in'),p('out','out',1,'Cout')];
  fa.nodes.push(n('carry-ab','and','A·B',280,400,[p('a','in'),p('b','in'),p('c','out')]),n('carry-cin','and','Cin·(A⊕B)',500,400,[p('a','in'),p('b','in'),p('c','out')]));
  fa.requiredEdges=fa.requiredEdges.filter(e=>e.to.nodeId!==carry.id&&e.from.nodeId!==carry.id);
  fa.requiredEdges.push(...['input-a.out carry-ab.a','input-b.out carry-ab.b','xor-1.s carry-cin.a','input-cin.out carry-cin.b','carry-ab.c carry-logic.a','carry-cin.c carry-logic.b','carry-logic.out cout-output.in'].map(item=>link(...item.split(' '))));
  fullCoverage(fa,['input-a','input-b','input-cin'],['sum-output','cout-output'],([a,b,c])=>[(a+b+c)&1,Number(a+b+c>=2)]);
  fullCoverage(get('mux'),['data-0','data-1','select'],['output-y'],([a,b,s])=>[s?b:a]);
  fullCoverage(get('multi-adder'),['a0','a1','a2','b0','b1','b2','cin'],['s0','s1','s2','cout'],([a0,a1,a2,b0,b1,b2,c])=>{const sum=a0+2*a1+4*a2+b0+2*b1+4*b2+c;return [sum&1,(sum>>1)&1,(sum>>2)&1,(sum>>3)&1];});
  const alu=get('alu');control(alu.nodes.find(n=>n.id==='op'),0,3,2,['0 · 加法','1 · 与','2 · 或','3 · 异或']);width(alu.nodes.find(n=>n.id==='alu-core'),'op',2);
  const aluCases=[];
  for(let a=0;a<2;a++)for(let b=0;b<2;b++)for(let cin=0;cin<2;cin++)for(let op=0;op<4;op++){const f=[(a+b+cin)&1,a&b,a|b,a^b][op];aluCases.push({name:`A=${a},B=${b},Cin=${cin},Op=${op}`,inputs:{'input-a.out':a,'input-b.out':b,'input-cin.out':cin,'op.out':op},expected:{'result-f.in':f,'zero-flag.in':Number(f===0),'carry-flag.in':Number(op===0&&a+b+cin>=2)}});}
  const aluKeys=new Set(alu.testCases.map(t=>JSON.stringify(Object.entries(t.inputs).sort())));alu.hiddenTestCases=aluCases.filter(t=>!aluKeys.has(JSON.stringify(Object.entries(t.inputs).sort())));

  const cpu=get('cpu-datapath'),byId=id=>cpu.nodes.find(n=>n.id===id);
  control(byId('pc'),0,3,2,['0 · ADD','1 · AND','2 · OR','3 · XOR']);
  byId('instr-memory').type='instructionRom';width(byId('instr-memory'),'in',2);width(byId('instr-memory'),'out',4);
  byId('ir').type='opcode';width(byId('ir'),'in',4);width(byId('ir'),'out',2);
  byId('controller').ports.forEach(port=>width(byId('controller'),port.id,2));
  byId('regfile').type='registerRead';byId('regfile').ports=[p('in','in',2,'读控制'),p('a','in',3,'R1'),p('b','in',3,'R2'),p('out','out',3,'操作数 A'),p('bOut','out',3,'操作数 B')];
  byId('alu-unit').type='aluWord';byId('alu-unit').ports=[p('in','in',3,'A'),p('b','in',3,'B'),p('op','in',2,'Op'),p('out','out',3,'结果')];width(byId('writeback'),'in',3);
  for(const [id,label,y] of [['r1','寄存器 R1',400],['r2','寄存器 R2',580]]){const input=n(id,'input',label,50,y,[p('out','out',3,label)]);control(input,0,7,3);cpu.nodes.push(input);}
  cpu.requiredEdges.push(...['r1.out regfile.a','r2.out regfile.b','regfile.bOut alu-unit.b','controller.out alu-unit.op'].map(item=>link(...item.split(' '))));
  const cpuCase=(op,a,b)=>({name:`${['ADD','AND','OR','XOR'][op]} R1=${a},R2=${b}`,inputs:{'pc.out':op,'r1.out':a,'r2.out':b},expected:{'writeback.in':[(a+b)&7,a&b,a|b,a^b][op]}});
  cpu.testCases=[cpuCase(0,1,1),cpuCase(1,3,1),cpuCase(2,4,1),cpuCase(3,3,1)];
  cpu.hiddenTestCases=[];for(let op=0;op<4;op++)for(let a=0;a<8;a++)for(let b=0;b<8;b++)if(!cpu.testCases.some(t=>t.inputs['pc.out']===op&&t.inputs['r1.out']===a&&t.inputs['r2.out']===b))cpu.hiddenTestCases.push(cpuCase(op,a,b));
  cpu.goal='连接真实教学指令 ROM、译码、R1/R2、三位 ALU 和写回通路，验证 ADD/AND/OR/XOR。组合快照不保存时钟状态，ADD 结果按三位截断。';

  for(const m of models){
    if(!['computer-components','program-flow','instruction-data','memory-address','machine-number','data-flow'].includes(m.id))m.gradingMode='functional';
    m.hints??=[m.goal,'先追踪输入到处理单元，再追踪每个输出；数据通路和控制通路都要有来源。','利用公开用例逐一排查；完整检测还会验证其余输入组合。'];
    // Preserve topology while giving every component its own usable hit area.
    const columns=[...new Set(m.nodes.map(n=>n.position.x))].sort((a,b)=>a-b);
    const groups=new Map(columns.map(x=>[x,m.nodes.filter(n=>n.position.x===x)]));
    columns.forEach((x,col)=>{
      let bottom=-140;
      groups.get(x).sort((a,b)=>a.position.y-b.position.y).forEach(node=>{
        const count=Math.max(node.ports.filter(p=>p.direction==='in').length,node.ports.filter(p=>p.direction==='out').length);
        node.position={x:40+col*240,y:Math.max(node.position.y,bottom+40)};
        bottom=node.position.y+Math.max(140,70+count*26);
      });
    });
  }
  return models;
}
