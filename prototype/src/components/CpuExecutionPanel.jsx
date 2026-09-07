import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowCounterClockwise, FastForward, Play, SkipForward } from "@phosphor-icons/react";
import { assembleEdu16, createEdu16State, executeInstruction, runEdu16, stepMicro } from "../cpuSimulator.js";
import { api } from "../apiClient.js";

const DEFAULT_SOURCE = "LOAD 16\nADD 17\nSTORE 18\nHALT";
const DEFAULT_MEMORY = { 16: 6, 17: 1 };
function initialMachine() { return createEdu16State({ program: assembleEdu16(DEFAULT_SOURCE), memory: DEFAULT_MEMORY }); }

export function CpuExecutionPanel() {
  const [source, setSource] = useState(DEFAULT_SOURCE);
  const [machine, setMachine] = useState(initialMachine);
  const [message, setMessage] = useState("载入预设：6 + 1，结果将写入地址 18。");
  const [syncing, setSyncing] = useState(true);
  const revisionRef = useRef(0);
  const registers = useMemo(() => [["PC", machine.pc], ["MAR", machine.mar], ["MDR", machine.mdr], ["IR", hex(machine.ir)], ["ACC", machine.acc]], [machine]);
  useEffect(() => {
    let active = true;
    api.cpuPractice().then(({ run }) => {
      if (!active) return;
      revisionRef.current = run.state?.revision ?? 0;
      const snapshot = [...(run.state?.events ?? [])].reverse().find((event) => event.payload?.machine)?.payload;
      if (snapshot?.machine) setMachine(snapshot.machine);
      if (snapshot?.source) setSource(snapshot.source);
      setMessage(snapshot?.machine ? "已恢复上次公共练习。" : "载入预设：6 + 1，结果将写入地址 18。");
      setSyncing(false);
    }).catch((error) => { if (active) { setMessage(`练习记录不可用：${error.message}`); setSyncing(false); } });
    return () => { active = false; };
  }, []);
  function persist(nextMachine, type, nextSource = source) {
    setSyncing(true);
    const batchId = createId();
    api.saveCpuPracticeEvents({ baseRevision: revisionRef.current, batchId, events: [{ eventId: createId(), type, payload: { machine: nextMachine, source: nextSource } }] })
      .then(({ run }) => { revisionRef.current = run.state.revision; setSyncing(false); })
      .catch((error) => { setMessage(`未同步：${error.message}`); setSyncing(false); });
  }
  function apply(result, type) { setMachine(result.state); setMessage(result.trace?.explanation ?? (result.state.trap || (result.state.halted ? "程序已停止。" : "程序执行完成。"))); persist(result.state, type); }
  function loadSource() { try { const next = createEdu16State({ program: assembleEdu16(source), memory: DEFAULT_MEMORY }); setMachine(next); setMessage("程序已载入。请用微步观察取指、译码和执行。"); persist(next, "cpu.loadProgram", source); } catch (error) { setMessage(error.message); } }
  function run() { const result = runEdu16(machine); setMachine(result.state); setMessage(result.state.trap || `已执行 ${result.instructionsExecuted} 条指令。`); persist(result.state, "cpu.executeInstruction"); }
  return <section className="cpu-execution-panel" aria-label="CPU 单步执行实验">
    <header><div><span className="eyebrow">真实执行实验</span><h2>EDU16-ACC 单步观察</h2><p>该教学机用 PC、MAR、MDR、IR 和 ACC 展示一次取指、取数与加法的真实状态变化。</p></div><span className={machine.trap ? "cpu-state trap" : machine.halted ? "cpu-state halted" : "cpu-state active"}>{machine.trap ? "已停止：异常" : machine.halted ? "已停止" : "可执行"}</span></header>
    <div className="cpu-execution-grid">
      <label className="cpu-program"><span>教学程序</span><textarea aria-label="EDU16 教学程序" disabled={syncing} onChange={(event) => setSource(event.target.value)} spellCheck="false" value={source} /><button className="ghost-button" disabled={syncing} onClick={loadSource} type="button">载入程序</button></label>
      <section className="cpu-datapath"><span className="eyebrow">当前微步骤</span><strong>{phaseName(machine.phase)}</strong><div className="cpu-transfer-row">{transfer(machine.phase).map((item) => <code key={item}>{item}</code>)}</div><p>{message}</p><div className="cpu-controls"><button className="primary-button" disabled={syncing || Boolean(machine.halted || machine.trap)} onClick={() => apply(stepMicro(machine), "cpu.stepMicro")} type="button"><SkipForward size={17} />微步</button><button className="ghost-button" disabled={syncing || Boolean(machine.halted || machine.trap)} onClick={() => apply(executeInstruction(machine), "cpu.executeInstruction")} type="button"><FastForward size={17} />执行一条</button><button className="ghost-button" disabled={syncing || Boolean(machine.halted || machine.trap)} onClick={run} type="button"><Play size={17} />运行</button><button className="ghost-button" disabled={syncing} onClick={() => { const next = initialMachine(); setMachine(next); setSource(DEFAULT_SOURCE); setMessage("已恢复 6 + 1 的教学预设。"); persist(next, "cpu.loadProgram", DEFAULT_SOURCE); }} type="button"><ArrowCounterClockwise size={17} />重置</button></div></section>
      <section className="cpu-registers"><span className="eyebrow">寄存器</span><div>{registers.map(([name, value]) => <dl key={name}><dt>{name}</dt><dd>{value}</dd></dl>)}</div></section>
      <section className="cpu-memory"><span className="eyebrow">相关主存单元</span><div>{[0, 1, 2, 3, 16, 17, 18].map((address) => <span className={machine.mar === address ? "selected" : ""} key={address}><b>M[{address}]</b><code>{hex(machine.memory[address])}</code><small>{machine.memory[address]}</small></span>)}</div></section>
    </div>
  </section>;
}
function hex(value) { return `0x${Number(value).toString(16).padStart(4, "0").toUpperCase()}`; }
function phaseName(phase) { return ({ "fetch-address": "取指地址", "fetch-read": "读取指令", "fetch-load-ir": "送入 IR", decode: "译码", "operand-address": "操作数地址", "operand-read": "读取操作数", execute: "执行", "write-back": "回写" })[phase] ?? "已停止"; }
function transfer(phase) { return ({ "fetch-address": ["PC → MAR"], "fetch-read": ["M(MAR) → MDR"], "fetch-load-ir": ["MDR → IR", "PC + 1 → PC"], "operand-address": ["IR.address → MAR"], "operand-read": ["M(MAR) → MDR"], execute: ["ACC / MDR → ALU"], "write-back": ["结果 → 状态"] })[phase] ?? ["无活动传递"]; }
function createId() { return `cpu-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`; }
