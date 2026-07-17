export class ApiError extends Error {
  constructor({ status, code, message, retryable = false }) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

export async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData) ? { "content-type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
  });
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    if (body && typeof body === "object" && body.error && typeof body.error === "object") {
      throw new ApiError({
        status: response.status,
        code: body.error.code ?? "UNKNOWN",
        message: body.error.message ?? "请求失败",
        retryable: body.error.retryable === true,
      });
    }
    const message = typeof body === "object" ? body.error : body;
    throw new Error(message || `请求失败：${response.status}`);
  }
  return body;
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
};
