let learningRole = 'student';
export function setPersonalLearningRole(role) { learningRole = role === 'teacher' ? 'teacher' : 'student'; }
// Self-owned learning and knowledge documents are shared. Student homework routes stay student-only.
const SHARED_PATH = /^\/api\/student\/(progress|attempts|mistakes|chapter-practice|demo-attempts|assembly-practice|shop-service|knowledge|learning-coach|study-workspace)(\/|$|\?)/;
export function personalLearningPath(path) {
  return learningRole === 'teacher' && SHARED_PATH.test(path) ? path.replace('/api/student/', '/api/teacher/') : path;
}
