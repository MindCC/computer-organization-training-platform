import { personalLearningPath } from './personalLearningApi.js';

export class ApiError extends Error {
  constructor({ status, code, message, retryable = false }) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 400;

let passwordChangeRequired = false;
const passwordChangeListeners = new Set();

/**
 * 强制改密信号：服务端对需要改密的账号会在任何业务接口返回
 * PASSWORD_CHANGE_REQUIRED。界面据此弹出阻断式改密页，而不是把 403 当成普通错误。
 */
export function onPasswordChangeRequired(listener) {
  passwordChangeListeners.add(listener);
  return () => passwordChangeListeners.delete(listener);
}

export function isPasswordChangeRequired() {
  return passwordChangeRequired;
}

export function clearPasswordChangeRequired() {
  passwordChangeRequired = false;
}

function notifyPasswordChangeRequired() {
  if (passwordChangeRequired) return;
  passwordChangeRequired = true;
  for (const listener of passwordChangeListeners) listener();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(path, options) {
  const { timeoutMs = REQUEST_TIMEOUT_MS, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(path, { ...fetchOptions, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function apiRequest(path, options = {}) {
  path = personalLearningPath(path);
  const retryableMethod = ["GET", "HEAD"].includes(String(options.method ?? "GET").toUpperCase());
  const maxAttempts = retryableMethod ? MAX_RETRIES : 0;
  let lastError;
  for (let attempt = 0; attempt <= maxAttempts; attempt += 1) {
    if (attempt > 0) {
      await delay(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
    }
    let response;
    try {
      response = await fetchWithTimeout(path, {
        credentials: "include",
        ...options,
        headers: {
          ...(options.body && !(options.body instanceof FormData) ? { "content-type": "application/json" } : {}),
          ...(options.headers ?? {}),
        },
      });
    } catch (error) {
      // 网络层失败（断网、超时、TLS）：只重试安全读取，避免重复写入。
      lastError = error;
      continue;
    }
    const contentType = response.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json") ? await response.json() : await response.text();
    if (!response.ok) {
      if (body && typeof body === "object" && body.error && typeof body.error === "object") {
        const apiError = new ApiError({
          status: response.status,
          code: body.error.code ?? "UNKNOWN",
          message: body.error.message ?? "请求失败",
          retryable: body.error.retryable === true,
        });
        if (apiError.code === "PASSWORD_CHANGE_REQUIRED") notifyPasswordChangeRequired();
        // 服务端明确标记可重试的错误才重试；其余直接抛
        if (retryableMethod && apiError.retryable && attempt < maxAttempts) {
          lastError = apiError;
          continue;
        }
        throw apiError;
      }
      const message = typeof body === "object" ? body.error : body;
      throw new ApiError({status:response.status,code:'HTTP_ERROR',message:message || `请求失败：${response.status}`});
    }
    return body;
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("请求失败，请检查网络连接");
}

export const api = {
  mindMapCapabilities: () => apiRequest('/api/mind-maps/capabilities'),
  mindMaps: () => apiRequest('/api/mind-maps'),
  mindMap: id => apiRequest(`/api/mind-maps/${id}`),
  generateMindMap: payload => apiRequest('/api/mind-maps/generate', {method:'POST',body:JSON.stringify(payload),timeoutMs:70000}),
  saveMindMap: (graph, saved) => apiRequest(saved?.id ? `/api/mind-maps/${saved.id}` : '/api/mind-maps', {method:saved?.id?'PUT':'POST',body:JSON.stringify({graph,version:saved?.version})}),
  deleteMindMap: id => apiRequest(`/api/mind-maps/${id}`,{method:'DELETE'}),
  login: (payload) => apiRequest("/api/auth/login", { method: "POST", body: JSON.stringify(payload) }),
  demoLogin: (payload) => apiRequest('/api/auth/demo-login', { method: 'POST', body: JSON.stringify(payload) }),
  logout: () => apiRequest("/api/auth/logout", { method: "POST" }),
  me: () => apiRequest("/api/auth/me"),
  changePassword: (payload) => apiRequest("/api/auth/change-password", { method: "POST", body: JSON.stringify(payload) }),
  updateAccountSettings: (payload) => apiRequest('/api/auth/settings', { method: 'PUT', body: JSON.stringify(payload) }),
  studentProgress: () => apiRequest("/api/student/progress"),
  learningActivity: () => apiRequest("/api/student/activity"),
  submitAttempt: (payload) => apiRequest("/api/student/attempts", { method: "POST", body: JSON.stringify(payload) }),
  listNotes: () => apiRequest("/api/student/notes"),
  createNote: (payload) => apiRequest("/api/student/notes", { method: "POST", body: JSON.stringify(payload) }),
  updateNote: (noteId, payload) => apiRequest(`/api/student/notes/${noteId}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteNote: (noteId) => apiRequest(`/api/student/notes/${noteId}`, { method: "DELETE" }),
  searchNotes: (params = {}) => {
    const query = new URLSearchParams();
    if (params.query) query.set("query", params.query);
    if (params.tag) query.set("tag", params.tag);
    if (params.challengeId) query.set("challengeId", params.challengeId);
    const qs = query.toString();
    return apiRequest(`/api/student/notes${qs ? "?" + qs : ""}`);
  },
  updateProfile: (payload) => apiRequest("/api/student/profile", { method: "PUT", body: JSON.stringify(payload) }),
  demoAttempts: () => apiRequest("/api/student/demo-attempts"),
  createClass: (payload) => apiRequest("/api/classes", { method: "POST", body: JSON.stringify(payload) }),
  teacherClasses: () => apiRequest("/api/teacher/classes"),
  importStudents: (classId, csv) => apiRequest(`/api/teacher/classes/${classId}/import-students`, { method: "POST", body: JSON.stringify({ csv }) }),
  classOverview: (classId) => apiRequest(`/api/teacher/classes/${classId}/overview`),
  assistantReport: (classId) => apiRequest(`/api/teacher/classes/${classId}/assistant-report`, { method: "POST" }),
  labAssistantHint: (payload) => apiRequest("/api/student/lab-assistant", { method: "POST", body: JSON.stringify(payload) }),
  studentDetail: (classId, studentId) => apiRequest(`/api/teacher/classes/${classId}/students/${studentId}`),
  resetStudentPassword: (studentId, password) => apiRequest(`/api/teacher/students/${studentId}/reset-password`, { method: "POST", body: JSON.stringify({ password }) }),
  // Classroom APIs
  currentClassroom: () => apiRequest("/api/student/classroom/current"),
  enterClassroom: (sessionId) => apiRequest(`/api/student/classroom/${sessionId}/enter`, { method: "POST" }),
  completeClassroomStage: (sessionId,payload) => apiRequest(`/api/student/classroom/${sessionId}/complete-stage`, {method:'POST',body:JSON.stringify(payload)}),
  taskLibrary: () => apiRequest('/api/teacher/task-library'),
  taskLibraryDetail: id => apiRequest(`/api/teacher/task-library/${id}`),
  taskLibraryLearning: (id,sessionId) => apiRequest(`/api/teacher/task-library/${id}/learning${sessionId==null?'':`?sessionId=${sessionId}`}`),
  createLibraryTask: config => apiRequest('/api/teacher/task-library',{method:'POST',body:JSON.stringify(config)}),
  updateLibraryTask: (id,payload) => apiRequest(`/api/teacher/task-library/${id}`,{method:'PUT',body:JSON.stringify(payload)}),
  deleteLibraryTask: (id,revision) => apiRequest(`/api/teacher/task-library/${id}`,{method:'DELETE',body:JSON.stringify({revision})}),
  publishLibraryTask: (id,payload) => apiRequest(`/api/teacher/task-library/${id}/publish`,{method:'POST',body:JSON.stringify(payload)}),
  updateClassroomSession: (sessionId,payload) => apiRequest(`/api/teacher/sessions/${sessionId}`, {method:'PUT',body:JSON.stringify(payload)}),
  createClassroomSession: (classId, payload) => apiRequest(`/api/teacher/classes/${classId}/sessions`, { method: "POST", body: JSON.stringify(payload) }),
  currentClassroomSession: (classId) => apiRequest(`/api/teacher/classes/${classId}/sessions/current`),
  startClassroomSession: (sessionId) => apiRequest(`/api/teacher/sessions/${sessionId}/start`, { method: "POST" }),
  pauseClassroomSession: (sessionId) => apiRequest(`/api/teacher/sessions/${sessionId}/pause`, { method: "POST" }),
  resumeClassroomSession: (sessionId) => apiRequest(`/api/teacher/sessions/${sessionId}/resume`, { method: "POST" }),
  endClassroomSession: (sessionId) => apiRequest(`/api/teacher/sessions/${sessionId}/end`, { method: "POST" }),
  classroomOverview: (sessionId) => apiRequest(`/api/teacher/sessions/${sessionId}/overview`),
  classroomReport: (sessionId) => apiRequest(`/api/teacher/sessions/${sessionId}/report`),
  // Assignment APIs
  createAssignment: (classId, payload) => apiRequest(`/api/teacher/classes/${classId}/assignments`, { method: "POST", body: JSON.stringify(payload) }),
  addQuestion: (assignmentId, payload) => apiRequest(`/api/teacher/assignments/${assignmentId}/questions`, { method: "POST", body: JSON.stringify(payload) }),
  publishAssignment: (assignmentId) => apiRequest(`/api/teacher/assignments/${assignmentId}/publish`, { method: "POST" }),
  teacherAssignments: (classId) => apiRequest(`/api/teacher/classes/${classId}/assignments`),
  generateTaskChain: (classId,payload) => apiRequest(`/api/teacher/classes/${classId}/task-chain/generate`,{method:'POST',body:JSON.stringify(payload),timeoutMs:70000}),
  assignmentDetail: (assignmentId) => apiRequest(`/api/teacher/assignments/${assignmentId}`),
  assignmentSubmissions: (assignmentId) => apiRequest(`/api/teacher/assignments/${assignmentId}/submissions`),
  gradeSubmission: (submissionId, payload) => apiRequest(`/api/teacher/submissions/${submissionId}/grade`, { method: "POST", body: JSON.stringify(payload) }),
  assignmentAnalytics: (classId) => apiRequest(`/api/teacher/classes/${classId}/assignment-analytics`),
  studentAssignmentAnalytics: (studentId) => apiRequest(`/api/teacher/students/${studentId}/assignment-analytics`),
  studentAssignments: () => apiRequest("/api/student/assignments"),
  // 题库与自动出卷（教师）
  questionBank: (params = {}) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value != null && value !== "")).toString();
    return apiRequest(`/api/teacher/question-bank${query ? `?${query}` : ""}`);
  },
  createBankQuestion: (payload) => apiRequest("/api/teacher/question-bank", { method: "POST", body: JSON.stringify(payload) }),
  updateBankQuestion: (id, payload) => apiRequest(`/api/teacher/question-bank/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteBankQuestion: (id) => apiRequest(`/api/teacher/question-bank/${id}`, { method: "DELETE" }),
  importBankQuestions: (payload) => apiRequest("/api/teacher/question-bank/import", { method: "POST", body: JSON.stringify(payload) }),
  aiGenerateBankQuestions: (payload) => apiRequest("/api/teacher/question-bank/ai-generate", { method: "POST", body: JSON.stringify(payload), timeoutMs: 70000 }),
  composeBankPaper: (payload) => apiRequest("/api/teacher/question-bank/compose", { method: "POST", body: JSON.stringify(payload) }),
  teacherKnowledgeDocuments: () => apiRequest("/api/teacher/knowledge/documents"),
  studentAssignmentDetail: (assignmentId) => apiRequest(`/api/student/assignments/${assignmentId}`),
  saveAssignmentDraft: (assignmentId, answers) => apiRequest(`/api/student/assignments/${assignmentId}/draft`, { method: "POST", body: JSON.stringify({ answers }) }),
  submitAssignment: (assignmentId, answers) => apiRequest(`/api/student/assignments/${assignmentId}/submit`, { method: "POST", body: JSON.stringify({ answers }) }),
  studentSubmissions: () => apiRequest("/api/student/submissions"),
  // Course workbench APIs
  createCourseDraft: (classId, payload) => apiRequest(`/api/teacher/classes/${classId}/course-drafts`, { method: "POST", body: JSON.stringify(payload) }),
  generateCourseDraft: (classId, payload) => apiRequest(`/api/teacher/classes/${classId}/course-drafts/generate`, { method: "POST", body: JSON.stringify(payload) }),
  teacherCourseDrafts: (classId) => apiRequest(`/api/teacher/classes/${classId}/course-drafts`),
  courseDraftDetail: (draftId) => apiRequest(`/api/teacher/course-drafts/${draftId}`),
  updateCourseDraft: (draftId, payload) => apiRequest(`/api/teacher/course-drafts/${draftId}`, { method: "PUT", body: JSON.stringify(payload) }),
  publishCourseDraft: (draftId) => apiRequest(`/api/teacher/course-drafts/${draftId}/publish`, { method: "POST" }),
  createProjectTeam: (draftId, payload) => apiRequest(`/api/teacher/course-drafts/${draftId}/project/teams`, { method: "POST", body: JSON.stringify(payload) }),
  replaceProjectTeamMembers: (teamId, members) => apiRequest(`/api/teacher/project-teams/${teamId}/members`, { method: "PUT", body: JSON.stringify({ members }) }),
  reviewProjectSubmission: (submissionId, feedback) => apiRequest(`/api/teacher/project-submissions/${submissionId}/review`, { method: "POST", body: JSON.stringify({ feedback }) }),
  projectSummary: (classId) => apiRequest(`/api/teacher/classes/${classId}/project-summary`),
  teacherLabRuns: (classId) => apiRequest(`/api/teacher/classes/${classId}/lab-runs`),
  studentProjects: () => apiRequest("/api/student/projects"),
  cpuPractice: () => apiRequest("/api/student/cpu-practice"),
  saveCpuPracticeEvents: (payload) => apiRequest("/api/student/cpu-practice/events", { method: "POST", body: JSON.stringify(payload) }),
  studentProjectDetail: (projectId) => apiRequest(`/api/student/projects/${projectId}`),
  submitProjectMilestone: (projectId, milestoneId, payload) => apiRequest(`/api/student/projects/${projectId}/milestones/${milestoneId}/submission`, { method: "POST", body: JSON.stringify(payload) }),
  mistakes: () => apiRequest("/api/student/mistakes"),
  chapterPractice: () => apiRequest("/api/student/chapter-practice"),
  submitChapterPractice: (payload) => apiRequest("/api/student/chapter-practice", { method: "POST", body: JSON.stringify(payload) }),
  reviewAssignmentMistake: (payload) => apiRequest("/api/student/mistakes/review", { method: "POST", body: JSON.stringify(payload) }),
  auditLogs: (params = {}) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== "")).toString();
    return apiRequest(`/api/teacher/audit-logs${query ? `?${query}` : ""}`);
  },
  setSkipLocked: (classId, allow) => apiRequest(`/api/teacher/classes/${classId}/skip-locked`, { method: "PUT", body: JSON.stringify({ allow }) }),
  // 备份是二进制流，不能走 apiRequest 的 json/text 解析；需要本人口令二次确认。
  downloadBackup: async (password) => {
    const response = await fetch("/api/admin/backup", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!response.ok) {
      const contentType = response.headers.get("content-type") ?? "";
      const body = contentType.includes("application/json") ? await response.json() : await response.text();
      throw new Error(typeof body?.error === "string" ? body.error : (body?.error?.message ?? `下载失败：${response.status}`));
    }
    return response.blob();
  },
  sessions: () => apiRequest("/api/teacher/sessions"),
  revokeSession: (sessionId) => apiRequest(`/api/teacher/sessions/${sessionId}`, { method: "DELETE" }),
  coursewareUploads: () => apiRequest("/api/courseware/uploads"),
  uploadCourseware: (file, classId = null) => apiRequest("/api/courseware/uploads", {
    method: "POST",
    body: file,
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "x-file-name": encodeURIComponent(file.name),
      ...(classId ? { "x-class-id": String(classId) } : {}),
    },
  }),
  coursewareNotes: (coursewareId, pageNumber) => apiRequest(`/api/courseware/uploads/${coursewareId}/notes?page=${pageNumber}`),
  addCoursewareNote: (coursewareId, payload) => apiRequest(`/api/courseware/uploads/${coursewareId}/notes`, { method: "POST", body: JSON.stringify(payload) }),
  // 知识库（LLMWiki）API
  knowledgeDocuments: () => apiRequest("/api/student/knowledge/documents"),
  knowledgeDocumentDetail: (documentId) => apiRequest(`/api/student/knowledge/documents/${documentId}`),
  deleteKnowledgeDocument: (documentId) => apiRequest(`/api/student/knowledge/documents/${documentId}`, { method: "DELETE" }),
  searchKnowledge: (query) => apiRequest(`/api/student/knowledge/search?q=${encodeURIComponent(query)}`),
  // 上传要走自定义 fetch：LLM 分析可能超过 apiRequest 的 15s 超时。
  // 上传机制复用课件模式——原始二进制 + x-file-name 头，Content-Type 统一 octet-stream。
  uploadKnowledgeDocument: async (file) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    try {
      const response = await fetch(personalLearningPath('/api/student/knowledge/upload'), {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/octet-stream",
          "x-file-name": encodeURIComponent(file.name),
        },
        body: file,
        signal: controller.signal,
      });
      const contentType = response.headers.get("content-type") ?? "";
      const body = contentType.includes("application/json") ? await response.json() : await response.text();
      if (!response.ok) {
        const message = typeof body === "object" ? (body?.error?.message ?? body?.error) : body;
        throw new Error(typeof message === "string" && message ? message : `上传失败：${response.status}`);
      }
      return body;
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("上传超时：文档解析或 AI 分析耗时过长，请稍后再试");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  },
};
