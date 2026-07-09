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
};
