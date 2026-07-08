import { buildMachineNumberExercise, encodeSignedInteger } from "../numberEncoding.js";

export function MachineNumberPanel({ value }) {
  const encoded = encodeSignedInteger(value, 4);
  const exercise = buildMachineNumberExercise();

  return (
    <section className="machine-number-panel">
      <div className="machine-number-heading">
        <div>
          <span className="eyebrow">机器数小测</span>
          <h2>4 位原码、反码、补码</h2>
        </div>
        <strong>{value}</strong>
      </div>
      <div className="machine-number-grid">
        <div>
          <span>原码</span>
          <strong>{encoded.signMagnitude ?? "溢出"}</strong>
          <small>符号位 + 数值位</small>
        </div>
        <div>
          <span>反码</span>
          <strong>{encoded.onesComplement ?? "溢出"}</strong>
          <small>负数数值位取反</small>
        </div>
        <div>
          <span>补码</span>
          <strong>{encoded.twosComplement ?? "溢出"}</strong>
          <small>负数反码加 1</small>
        </div>
      </div>
      <div className="machine-number-cases">
        {exercise.cases.slice(0, 5).map((item) => (
          <article className={item.value === value ? "active" : ""} key={item.value}>
            <span>{item.value}</span>
            <code>{item.expected.signMagnitude}</code>
            <code>{item.expected.onesComplement}</code>
            <code>{item.expected.twosComplement}</code>
          </article>
        ))}
      </div>
    </section>
  );
}
