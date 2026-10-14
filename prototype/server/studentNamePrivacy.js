// Presentation-only privacy. Account identities, roster names and persisted evidence stay intact.
export function maskStudentName(value) {
  const chars = Array.from(String(value ?? '').trim());
  if (!chars.length) return '';
  if (chars.length === 1) return '*';
  if (chars.length === 2) return chars[0] + '*';
  return chars[0] + '*'.repeat(chars.length - 2) + chars.at(-1);
}

export function studentNamePrivacyEnabled(options = {}, env = process.env) {
  if (typeof options.maskStudentNames === 'boolean') return options.maskStudentNames;
  if (env.MASK_STUDENT_NAMES !== undefined) return !['0', 'false', 'off'].includes(String(env.MASK_STUDENT_NAMES).toLowerCase());
  return env.NODE_ENV === 'production';
}

const nameFields = new Set(['displayName', 'display_name', 'studentName', 'student_name', 'authorName', 'author_name', 'actorName', 'name']);
export function projectStudentNames(value, studentNames) {
  if (Array.isArray(value)) return value.map(item => projectStudentNames(item, studentNames));
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    const ownTeacherName = ['teacher', 'admin'].includes(value.role) && ['displayName', 'display_name', 'name'].includes(key);
    const teacherAuthor = ['teacher', 'admin'].includes(value.authorRole) && ['authorName', 'author_name'].includes(key);
    const studentField = ['studentName', 'student_name'].includes(key) || value.role === 'student' ||
      (['displayName','display_name','name'].includes(key) && (value.studentId !== undefined || value.student_id !== undefined)) ||
      (['authorName','author_name'].includes(key) && value.authorRole === 'student');
    const masked = typeof item === 'string' && nameFields.has(key) && !ownTeacherName && !teacherAuthor &&
      (studentField || studentNames.has(item)) ? maskStudentName(item) : projectStudentNames(item, studentNames);
    return [key, masked];
  }));
}

export function createStudentNamePrivacy({ db, enabled }) {
  return (req, res, next) => {
    res.locals.presentStudentName = enabled ? maskStudentName : value => value;
    if (enabled && req.path.startsWith('/api/')) {
      res.set('Cache-Control', 'no-store');
      const json = res.json;
      res.json = function (body) {
        // Read current identities for this response: imports and renames are effective immediately.
        const names = new Set(db.prepare("SELECT DISTINCT display_name FROM users WHERE role='student'").all().map(row => row.display_name));
        return json.call(this, projectStudentNames(body, names));
      };
    }
    next();
  };
}
