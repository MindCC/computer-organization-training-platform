(function(root){
  'use strict';
  function bit(value){return Number(value)&1;}
  function halfAdder(a,b){a=bit(a);b=bit(b);return {sum:a^b,carry:a&b};}
  function fullAdder(a,b,cin){a=bit(a);b=bit(b);cin=bit(cin);const p=a^b,g=a&b,t=p&cin;return {sum:p^cin,carry:g|t,p,g,t};}
  function rippleAdd(a,b,cin=0){a=Number(a)&15;b=Number(b)&15;let carry=bit(cin),output=0;const stages=[];
    for(let index=0;index<4;index++){const ai=(a>>index)&1,bi=(b>>index)&1,stage=fullAdder(ai,bi,carry);stages.push({index,a:ai,b:bi,cin:carry,...stage});output|=stage.sum<<index;carry=stage.carry;}
    return {output,carry,zero:output===0?1:0,stages};
  }
  function alu4(a,b,op,cin=0){a=Number(a)&15;b=Number(b)&15;if(op==='ADD')return rippleAdd(a,b,cin);
    const output=op==='AND'?(a&b):op==='OR'?(a|b):op==='XOR'?(a^b):null;
    if(output===null)throw Error('Unknown ALU operation');return {output,carry:0,zero:output===0?1:0,stages:[]};
  }
  function binary(value,width=4){return Number(value).toString(2).padStart(width,'0');}
  function quizQuestion(index,random=Math.random){
    const int=max=>Math.floor(random()*(max+1));let mode=index%3,a,b,cin=0,op='ADD',answer,prompt;
    if(mode===0){a=int(1);b=int(1);const value=halfAdder(a,b);answer=2*value.carry+value.sum;prompt='半加器 A='+a+'、B='+b+'，把 C、S 合为二位二进制数，其十进制值是？';}
    else if(mode===1){a=int(1);b=int(1);cin=int(1);const value=fullAdder(a,b,cin);answer=2*value.carry+value.sum;prompt='全加器 A='+a+'、B='+b+'、Cin='+cin+'，把 Cout、S 合为二位二进制数，其十进制值是？';}
    else{a=int(15);b=int(15);op=['ADD','AND','OR','XOR'][int(3)];const value=alu4(a,b,op);answer=16*value.carry+value.output;prompt='4 位 ALU：A='+binary(a)+'、B='+binary(b)+'，执行 '+op+'，含进位的结果十进制值是？';}
    const limit=mode===2?31:3,options=new Set([answer]);let candidate=answer;
    while(options.size<4){candidate=(candidate+1)%(limit+1);options.add(candidate);}
    return {mode,a,b,cin,op,answer,prompt,options:[...options].sort((x,y)=>x-y)};
  }
  root.AdderAluCore=Object.freeze({halfAdder,fullAdder,rippleAdd,alu4,binary,quizQuestion});
})(globalThis);
