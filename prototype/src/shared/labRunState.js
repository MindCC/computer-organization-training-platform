const MAX_BATCH_EVENTS = 50;
const MAX_TRACKED_BATCHES = 100;
const EVENT_TYPES = new Set([
  "cpu.executeInstruction", "cpu.stepMicro", "cpu.loadProgram",
  "circuit.saveArtifact", "circuit.evaluate", "assembly.check", "assembly.install",
]);

export function createLabRunSnapshot() {
  return { revision: 0, seenBatchIds: [], events: [] };
}

export function normalizeLabEventBatch(value) {
  const input = object(value, "事件批次");
  const baseRevision = input.baseRevision;
  if (!Number.isInteger(baseRevision) || baseRevision < 0) throw invalid("基础版本无效");
  const batchId = identifier(input.batchId, "批次标识");
  if (!Array.isArray(input.events) || input.events.length === 0 || input.events.length > MAX_BATCH_EVENTS) throw invalid("事件批次不能超过 50 条且不能为空");
  const ids = new Set();
  const events = input.events.map((event) => {
    const item = object(event, "实验事件");
    const eventId = identifier(item.eventId, "事件标识");
    if (ids.has(eventId)) throw invalid("事件标识重复");
    ids.add(eventId);
    const type = eventType(item.type);
    if (!EVENT_TYPES.has(type)) throw invalid("事件类型不受支持");
    const payload = item.payload ?? {};
    if (!payload || typeof payload !== "object" || Array.isArray(payload) || JSON.stringify(payload).length > 4096) throw invalid("事件内容无效");
    return { eventId, type, payload };
  });
  return { baseRevision, batchId, events };
}

export function applyLabEventBatch(snapshot, batch) {
  const current = normalizeSnapshot(snapshot);
  if (current.seenBatchIds.includes(batch.batchId)) return { duplicate: true, snapshot: current, events: [] };
  if (batch.baseRevision !== current.revision) throw Object.assign(new Error("实验记录版本冲突，请同步后重试。"), { status: 409 });
  const events = batch.events.map((event, index) => ({ ...event, sequence: current.revision + index + 1 }));
  const next = {
    revision: current.revision + events.length,
    seenBatchIds: [...current.seenBatchIds, batch.batchId].slice(-MAX_TRACKED_BATCHES),
    events: [...current.events, ...events].slice(-500),
  };
  return { duplicate: false, snapshot: next, events };
}

function normalizeSnapshot(value) {
  const input = value && typeof value === "object" ? value : {};
  return {
    revision: Number.isInteger(input.revision) && input.revision >= 0 ? input.revision : 0,
    seenBatchIds: Array.isArray(input.seenBatchIds) ? input.seenBatchIds.filter((item) => typeof item === "string").slice(-MAX_TRACKED_BATCHES) : [],
    events: Array.isArray(input.events) ? input.events.slice(-500) : [],
  };
}
function object(value, label) { if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid(`${label}格式无效`); return value; }
function identifier(value, label) { if (typeof value !== "string" || !/^[a-z][a-z0-9-]*$/i.test(value) || value.length > 80) throw invalid(`${label}无效`); return value; }
function eventType(value) { if (typeof value !== "string" || !/^[a-z][a-z0-9.-]*$/i.test(value) || value.length > 80) throw invalid("事件类型无效"); return value; }
function invalid(message) { return Object.assign(new Error(message), { status: 400 }); }
