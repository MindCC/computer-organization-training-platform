// One whitelist for the hosted platform shell; the lesson HTML stays standalone.
export const HOSTED_DEMOS = Object.freeze([
  {id:"intro",title:"计算机系统组成与冯·诺依曼结构",chapterId:"ch1",file:"intro.html"},
  {id:"twos-complement",title:"补码的运算",chapterId:"ch2",file:"twos-complement.html"},
  {id:"arithmetic-basics",title:"运算基础（补码与移位）",chapterId:"ch2",file:"arithmetic-basics.html"},
  {id:"alu",title:"定点乘除与浮点运算",chapterId:"ch2",file:"alu.html"},
  {id:"adder-alu",title:"半加器、全加器与运算器",chapterId:"ch3",file:"adder-alu.html"},
  {id:"memory-system",title:"存储器系统",chapterId:"ch4",file:"memory-system.html"},
  {id:"addressing",title:"指令系统与寻址方式",chapterId:"ch5",file:"addressing.html"},
  {id:"cpu",title:"CPU 的结构与设计",chapterId:"ch6",file:"cpu.html"},
  {id:"bus",title:"系统总线",chapterId:"ch7",file:"bus.html"},
  {id:"io",title:"输入输出系统",chapterId:"ch8",file:"io.html"},
]);
export function hostedDemoOf(id) {
  if (id === "courseware") return {id,title:"课程课件 · 演讲视图",path:"/courseware.html"};
  const demo = HOSTED_DEMOS.find(item => item.id === id);
  return demo ? {...demo,path:`/demos/${demo.file}`} : null;
}
export function demoRedirectTarget(requestUrl) {
  const url = new URL(requestUrl, "http://localhost");
  if (url.searchParams.get("embedded") === "1") return null;
  const id = url.pathname === "/courseware.html" ? "courseware" : HOSTED_DEMOS.find(demo => url.pathname === `/demos/${demo.file}`)?.id;
  return id ? `/?demo=${id}` : null;
}
export function hostedDemoMiddleware(req,res,next) {
  const target = ["GET","HEAD"].includes(req.method) ? demoRedirectTarget(req.url) : null;
  if (target) { res.statusCode = 302; res.setHeader("Location",target); res.end(); }
  else next();
}
