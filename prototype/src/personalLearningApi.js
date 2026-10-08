let learningRole = 'student';
export function setPersonalLearningRole(role) { learningRole = role === 'teacher' ? 'teacher' : 'student'; }
// Self-owned learning and knowledge documents are shared. Student homework routes stay student-only.
const SHARED_PATH = /^\/api\/student\/(progress|activity|attempts|mistakes|chapter-practice|demo-attempts|assembly-practice|shop-service|custom-customers|knowledge|learning-coach|study-workspace|study-assistant|cpu-practice|lab-assistant|photo-imports|photo-mistakes|photo-rounds)(\/|$|\?)/;
export function personalLearningPath(path) {
  if(learningRole === 'teacher' && path === '/api/student/report.md') return '/api/teacher/report.md';
  return learningRole === 'teacher' && SHARED_PATH.test(path) ? path.replace('/api/student/', '/api/teacher/') : path;
}
