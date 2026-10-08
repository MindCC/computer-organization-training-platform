/**
 * 拍照导入错题的前端纯视图模型：裁剪样式、复习卷组卷、核对草稿编辑辅助。
 * 不依赖 React / fetch，便于单元测试。
 */

/** 归一化 box → CSS clip-path inset()，用于从整张照片裁出单题。 */
export function boxClipPath(box) {
  if (!box || typeof box !== 'object') return null;
  const { x, y, w, h } = box;
  if (![x, y, w, h].every((value) => Number.isFinite(value))) return null;
  const pct = (value) => `${Math.min(100, Math.max(0, value * 100)).toFixed(1)}%`;
  return `inset(${pct(y)} ${pct(1 - x - w)} ${pct(1 - y - h)} ${pct(x)})`;
}

/** 可组复习卷的来源：有标准题干与参考答案的错题。实验/维修类不含标准题干，不参与。 */
export const PAPER_SOURCES = ['photo', 'practice', 'assignment', 'demo'];

export function canJoinReviewPaper(item) {
  return Boolean(item && PAPER_SOURCES.includes(item.source) && typeof item.stem === 'string' && item.stem.trim());
}

const TYPE_LABELS = { choice: '选择题', truefalse: '判断题', fill: '填空题', short_answer: '简答题', demo: '练习题' };
const answerSpaceLines = (type) => ({ choice: 1, truefalse: 1, fill: 2 })[type] ?? 4;

/**
 * 把勾选的错题整理成打印复习卷模型。
 * @param {Array} items 统一错题本条目中已勾选的部分（保持勾选顺序）
 */
export function buildReviewPaperModel(items, { studentName = '', title = '错题复习卷' } = {}) {
  const questions = items.map((item, index) => ({
    number: index + 1,
    sourceLabel: item.errorType ?? item.source,
    chapterTitle: item.title ?? '',
    knowledgeLabel: item.knowledgeLabel ?? '',
    typeLabel: TYPE_LABELS[item.type] ?? '练习题',
    stem: item.stem.trim(),
    options: Array.isArray(item.options) ? item.options : [],
    answerLines: answerSpaceLines(item.type),
    referenceAnswer: item.referenceAnswer || '结合课堂材料复习',
    explanation: item.explanation || '',
    wrongAnswer: item.studentAnswer || '',
  }));
  return {
    title,
    studentName,
    generatedAt: new Date().toISOString(),
    questionCount: questions.length,
    questions,
    answers: questions.map((question) => ({
      number: question.number,
      referenceAnswer: question.referenceAnswer,
      explanation: question.explanation,
      wrongAnswer: question.wrongAnswer,
    })),
  };
}

/** 合并核对草稿中的多道题（下标升序）：内容并入序号最小的题，其余删除。 */
export function mergeDraftQuestions(questions, indices) {
  if (!Array.isArray(questions) || !Array.isArray(indices) || indices.length < 2) return questions;
  const sorted = [...new Set(indices)].sort((a, b) => a - b);
  if (sorted.some((index) => !Number.isInteger(index) || index < 0 || index >= questions.length)) return questions;
  const [target, ...rest] = sorted;
  const base = { ...questions[target] };
  const picked = rest.map((index) => questions[index]);
  const join = (field) => [base[field], ...picked.map((question) => question[field])].filter((value) => typeof value === 'string' && value.trim()).join('\n');
  base.stem = join('stem');
  base.studentAnswer = join('studentAnswer');
  base.referenceAnswer = join('referenceAnswer');
  base.explanation = join('explanation');
  return questions.filter((_, index) => !rest.includes(index)).map((question, index) => (index === target ? base : question));
}

/** 文件 → dataURL，并按最长边压缩（识别契约单张 ≤5MB，压缩也节省上传与存储）。 */
export async function fileToCompressedDataUrl(file, { maxSide = 1600, quality = 0.82 } = {}) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
  if (typeof document === 'undefined' || !/^data:image\/(png|jpeg|webp)/.test(dataUrl)) return dataUrl;
  const image = await new Promise((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('图片解码失败'));
    element.src = dataUrl;
  });
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  if (scale >= 1 && dataUrl.length < 5 * 1024 * 1024 * 1.37) return dataUrl;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}
