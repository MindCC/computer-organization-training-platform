export function createCourseWorkbenchRepository(db) {
  return {
    createDraft, getDraft, listDraftsByClass, updateDraft, publishDraft,
    getProject, createTeam, replaceTeamMembers, getStudentProject, listStudentProjects,
    upsertSubmission, reviewSubmission, getSubmission, getProjectSummary,
  };

  function createDraft({ teacherId, classId, payload }) {
    const result = db.prepare(`INSERT INTO course_drafts
      (teacher_id, class_id, title, summary, learning_objectives_json, guide_challenge_id, guide_script_json, assignment_outline_json, project_outline_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(teacherId, classId, payload.title, payload.summary, json(payload.learningObjectives), payload.guideChallengeId, json(payload.guideScript), json(payload.assignmentOutline), json(payload.projectOutline));
    return getDraft(Number(result.lastInsertRowid));
  }

  function getDraft(id) {
    const row = db.prepare("SELECT * FROM course_drafts WHERE id = ?").get(id);
    return row ? draftDto(row) : null;
  }

  function listDraftsByClass(classId) {
    return db.prepare("SELECT * FROM course_drafts WHERE class_id = ? ORDER BY id DESC").all(classId).map(draftDto);
  }

  function updateDraft(id, payload) {
    db.prepare(`UPDATE course_drafts SET title=?, summary=?, learning_objectives_json=?, guide_challenge_id=?, guide_script_json=?, assignment_outline_json=?, project_outline_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .run(payload.title, payload.summary, json(payload.learningObjectives), payload.guideChallengeId, json(payload.guideScript), json(payload.assignmentOutline), json(payload.projectOutline), id);
    return getDraft(id);
  }

  function publishDraft(id) {
    return db.transaction(() => {
      const draft = getDraft(id);
      if (!draft) return null;
      db.prepare("UPDATE course_drafts SET status='published', published_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(id);
      const result = db.prepare("INSERT INTO team_projects (course_draft_id, class_id, title, description, milestones_json) VALUES (?, ?, ?, ?, ?)")
        .run(id, draft.class_id, draft.projectOutline.title, draft.projectOutline.description, json(draft.projectOutline.milestones));
      return getProject(Number(result.lastInsertRowid));
    })();
  }

  function getProject(id) {
    const project = db.prepare("SELECT * FROM team_projects WHERE id=?").get(id);
    if (!project) return null;
    return projectDto(project, listTeams(id));
  }

  function createTeam({ projectId, name, members }) {
    return db.transaction(() => {
      const result = db.prepare("INSERT INTO project_teams (team_project_id, name) VALUES (?, ?)").run(projectId, name);
      replaceTeamMembers(Number(result.lastInsertRowid), members);
      return teamDto(db.prepare("SELECT * FROM project_teams WHERE id=?").get(Number(result.lastInsertRowid)));
    })();
  }

  function replaceTeamMembers(teamId, members) {
    return db.transaction(() => {
      db.prepare("DELETE FROM project_team_members WHERE team_id=?").run(teamId);
      const insert = db.prepare("INSERT INTO project_team_members (team_id, student_id, role) VALUES (?, ?, ?)");
      for (const member of members) insert.run(teamId, member.studentId, member.role);
      db.prepare("UPDATE project_teams SET updated_at=CURRENT_TIMESTAMP WHERE id=?").run(teamId);
      return teamDto(db.prepare("SELECT * FROM project_teams WHERE id=?").get(teamId));
    })();
  }

  function listTeams(projectId) {
    return db.prepare("SELECT * FROM project_teams WHERE team_project_id=? ORDER BY id").all(projectId).map(teamDto);
  }

  function getStudentProject(projectId, studentId) {
    const project = db.prepare("SELECT * FROM team_projects WHERE id=?").get(projectId);
    if (!project) return null;
    const team = db.prepare(`SELECT pt.* FROM project_teams pt JOIN project_team_members ptm ON ptm.team_id=pt.id
      WHERE pt.team_project_id=? AND ptm.student_id=?`).get(projectId, studentId);
    if (!team) return null;
    const teamDtoValue = teamDto(team);
    return { ...projectDto(project, [teamDtoValue]), team: teamDtoValue, submissions: listSubmissions(projectId, studentId) };
  }

  function listStudentProjects(studentId) {
    return db.prepare(`SELECT DISTINCT tp.id FROM team_projects tp JOIN project_teams pt ON pt.team_project_id=tp.id
      JOIN project_team_members ptm ON ptm.team_id=pt.id WHERE ptm.student_id=? ORDER BY tp.id DESC`).all(studentId)
      .map((row) => getStudentProject(row.id, studentId));
  }

  function upsertSubmission({ projectId, milestoneId, studentId, reflection, evidenceUrl, clientSubmissionId, status = "submitted" }) {
    const duplicate = clientSubmissionId ? db.prepare("SELECT * FROM project_milestone_submissions WHERE student_id=? AND client_submission_id=?").get(studentId, clientSubmissionId) : null;
    if (duplicate) return submissionDto(duplicate);
    const existing = db.prepare("SELECT * FROM project_milestone_submissions WHERE team_project_id=? AND milestone_id=? AND student_id=?").get(projectId, milestoneId, studentId);
    if (existing) {
      db.prepare(`UPDATE project_milestone_submissions SET reflection=?, evidence_url=?, status=?, client_submission_id=?, submitted_at=CASE WHEN ?='submitted' THEN CURRENT_TIMESTAMP ELSE submitted_at END, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .run(reflection, evidenceUrl, status, clientSubmissionId ?? null, status, existing.id);
      return getSubmission(existing.id);
    }
    const result = db.prepare(`INSERT INTO project_milestone_submissions (team_project_id, milestone_id, student_id, reflection, evidence_url, status, client_submission_id, submitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CASE WHEN ?='submitted' THEN CURRENT_TIMESTAMP ELSE NULL END)`)
      .run(projectId, milestoneId, studentId, reflection, evidenceUrl, status, clientSubmissionId ?? null, status);
    return getSubmission(Number(result.lastInsertRowid));
  }

  function reviewSubmission(id, feedback) {
    db.prepare("UPDATE project_milestone_submissions SET status='reviewed', teacher_feedback=?, reviewed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(feedback, id);
    return getSubmission(id);
  }

  function getSubmission(id) {
    const row = db.prepare("SELECT * FROM project_milestone_submissions WHERE id=?").get(id);
    return row ? submissionDto(row) : null;
  }

  function listSubmissions(projectId, studentId) {
    return db.prepare("SELECT * FROM project_milestone_submissions WHERE team_project_id=? AND student_id=? ORDER BY id").all(projectId, studentId).map(submissionDto);
  }

  function getProjectSummary(classId) {
    const rows = db.prepare(`SELECT pms.status, COUNT(*) AS count FROM team_projects tp
      LEFT JOIN project_milestone_submissions pms ON pms.team_project_id=tp.id WHERE tp.class_id=? GROUP BY pms.status`).all(classId);
    const statusCounts = Object.fromEntries(rows.filter((row) => row.status).map((row) => [row.status, row.count]));
    return {
      publishedCourseCount: db.prepare("SELECT COUNT(*) AS count FROM course_drafts WHERE class_id=? AND status='published'").get(classId).count,
      teamCount: db.prepare("SELECT COUNT(*) AS count FROM project_teams pt JOIN team_projects tp ON tp.id=pt.team_project_id WHERE tp.class_id=?").get(classId).count,
      ...statusCounts,
    };
  }

  function draftDto(row) {
    return { ...row, learningObjectives: parse(row.learning_objectives_json, []), guideChallengeId: row.guide_challenge_id, guideScript: parse(row.guide_script_json, []), assignmentOutline: parse(row.assignment_outline_json, {}), projectOutline: parse(row.project_outline_json, {}) };
  }
  function projectDto(row, teams) {
    const draft = db.prepare("SELECT guide_challenge_id, guide_script_json FROM course_drafts WHERE id=?").get(row.course_draft_id) ?? {};
    return { ...row, milestones: parse(row.milestones_json, []), guideChallengeId: draft.guide_challenge_id ?? null, guideScript: parse(draft.guide_script_json, []), teams };
  }
  function teamDto(row) {
    return { ...row, members: db.prepare(`SELECT ptm.student_id AS studentId, ptm.role, u.display_name AS displayName FROM project_team_members ptm JOIN users u ON u.id=ptm.student_id WHERE ptm.team_id=? ORDER BY ptm.student_id`).all(row.id) };
  }
  function submissionDto(row) { return { ...row, teamProjectId: row.team_project_id, milestoneId: row.milestone_id, studentId: row.student_id, evidenceUrl: row.evidence_url, teacherFeedback: row.teacher_feedback, clientSubmissionId: row.client_submission_id }; }
}

function json(value) { return JSON.stringify(value); }
function parse(value, fallback) { try { return JSON.parse(value); } catch { return fallback; } }
