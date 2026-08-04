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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(path, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(path, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function apiRequest(path, options = {}) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
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
      // 网络层失败（断网、超时、TLS）：可重试
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
        // 服务端明确标记可重试的错误才重试；其余直接抛
        if (apiError.retryable && attempt < MAX_RETRIES) {
          lastError = apiError;
          continue;
        }
        throw apiError;
      }
      const message = typeof body === "object" ? body.error : body;
      throw new Error(message || `请求失败：${response.status}`);
    }
    return body;
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("请求失败，请检查网络连接");
}

export const api = {
  login: (payload) => apiRequest("/api/auth/login", { method: "POST", body: JSON.stringify(payload) }),
  logout: () => apiRequest("/api/auth/logout", { method: "POST" }),
  me: () => apiRequest("/api/auth/me"),
  changePassword: (payload) => apiRequest("/api/auth/change-password", { method: "POST", body: JSON.stringify(payload) }),
  studentProgress: () => apiRequest("/api/student/progress"),
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
  createClass: (payload) => apiRequest("/api/classes", { method: "POST", body: JSON.stringify(payload) }),
  teacherClasses: () => apiRequest("/api/teacher/classes"),
  importStudents: (classId, csv) => apiRequest(`/api/teacher/classes/${classId}/import-students`, { method: "POST", body: JSON.stringify({ csv }) }),
  classOverview: (classId) => apiRequest(`/api/teacher/classes/${classId}/overview`),
  assistantReport: (classId) => apiRequest(`/api/teacher/classes/${classId}/assistant-report`, { method: "POST" }),
  studentDetail: (classId, studentId) => apiRequest(`/api/teacher/classes/${classId}/students/${studentId}`),
  resetStudentPassword: (studentId, password) => apiRequest(`/api/teacher/students/${studentId}/reset-password`, { method: "POST", body: JSON.stringify({ password }) }),
  // Classroom APIs
  currentClassroom: () => apiRequest("/api/student/classroom/current"),
  enterClassroom: (sessionId) => apiRequest(`/api/student/classroom/${sessionId}/enter`, { method: "POST" }),
  createClassroomSession: (classId, payload) => apiRequest(`/api/teacher/classes/${classId}/sessions`, { method: "POST", body: JSON.stringify(payload) }),
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
  assignmentDetail: (assignmentId) => apiRequest(`/api/teacher/assignments/${assignmentId}`),
  assignmentSubmissions: (assignmentId) => apiRequest(`/api/teacher/assignments/${assignmentId}/submissions`),
  gradeSubmission: (submissionId, payload) => apiRequest(`/api/teacher/submissions/${submissionId}/grade`, { method: "POST", body: JSON.stringify(payload) }),
  assignmentAnalytics: (classId) => apiRequest(`/api/teacher/classes/${classId}/assignment-analytics`),
  studentAssignmentAnalytics: (studentId) => apiRequest(`/api/teacher/students/${studentId}/assignment-analytics`),
  studentAssignments: () => apiRequest("/api/student/assignments"),
  studentAssignmentDetail: (assignmentId) => apiRequest(`/api/student/assignments/${assignmentId}`),
  saveAssignmentDraft: (assignmentId, answers) => apiRequest(`/api/student/assignments/${assignmentId}/draft`, { method: "POST", body: JSON.stringify({ answers }) }),
  submitAssignment: (assignmentId, answers) => apiRequest(`/api/student/assignments/${assignmentId}/submit`, { method: "POST", body: JSON.stringify({ answers }) }),
  studentSubmissions: () => apiRequest("/api/student/submissions"),
  mistakes: () => apiRequest("/api/student/mistakes"),
  auditLogs: (params = {}) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== "")).toString();
    return apiRequest(`/api/teacher/audit-logs${query ? `?${query}` : ""}`);
  },
  setSkipLocked: (classId, allow) => apiRequest(`/api/teacher/classes/${classId}/skip-locked`, { method: "PUT", body: JSON.stringify({ allow }) }),
  sessions: () => apiRequest("/api/teacher/sessions"),
  revokeSession: (sessionId) => apiRequest(`/api/teacher/sessions/${sessionId}`, { method: "DELETE" }),
};
