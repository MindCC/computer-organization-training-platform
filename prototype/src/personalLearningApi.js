let learningRole = 'student';
export function setPersonalLearningRole(role) { learningRole = role === 'teacher' ? 'teacher' : 'student'; }
// Only self-owned local learning routes are shared. AI and student homework routes stay student-only.
const SHARED_PATH = /^\/api\/student\/(progress|attempts|mistakes|chapter-practice|demo-attempts|assembly-practice|shop-service)(\/|$|\?)/;
export function personalLearningPath(path) {
  return learningRole === 'teacher' && SHARED_PATH.test(path) ? path.replace('/api/student/', '/api/teacher/') : path;
}
