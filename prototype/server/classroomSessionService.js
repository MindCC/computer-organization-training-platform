import { validateClassroomSessionConfig, getClassroomMission } from "../src/shared/classroomMissionDefinitions.js";
import { recordStudentAttempt, teacherOwnsClass } from "./db.js";
import { gradeClassroomEvidence, classroomError } from "./classroomMissionGrading.js";

export const ALLOWED_TRANSITIONS = Object.freeze({
  draft: new Set(["live"]),
  live: new Set(["paused", "ended"]),
  paused: new Set(["live", "ended"]),
  ended: new Set(),
});

export function computeActiveSeconds(session, nowMs) {
  const stored = Number(session.accumulated_active_seconds ?? 0);
  if (session.status !== "live" || !session.active_started_at) return stored;
  return stored + Math.max(0, Math.floor((nowMs - Date.parse(session.active_started_at)) / 1000));
}

export function calculateRewards({ stageScores, firstAttemptPasses, stageAttempts, streak, passScore }) {
  const completedScores = stageScores.filter((score) => Number.isFinite(score));
  const average = completedScores.length
    ? Math.round(completedScores.reduce((sum, score) => sum + score, 0) / completedScores.length)
    : 0;
  const baseXp = completedScores.reduce((sum, score) => sum + score, 0);
  const firstAttemptXp = firstAttemptPasses.filter(Boolean).length * 20;
  const streakXp = [10, 20, 30].slice(0, Math.max(0, Math.min(3, streak))).reduce((sum, value) => sum + value, 0);
  const stars = completedScores.length < 4 ? 0
    : average >= 95 && stageAttempts.every((attempts) => attempts <= 2) ? 3
    : average >= 90 ? 2
    : average >= passScore ? 1
    : 0;
  return { xp: baseXp + firstAttemptXp + streakXp, stars, average };
}

export function calculateBadges(passedStageIds) {
  const passed = new Set(passedStageIds);
  return [
    ...(passed.has("components") ? ["部件识别者"] : []),
    ...(passed.has("instruction-data") && passed.has("data-flow") ? ["数据流侦探"] : []),
  ];
}

export function createClassroomSessionService({ db, now = () => Date.now(), repository }) {
  function assertTeacherOwns(parentSession, teacherId) {
    if (!teacherOwnsClass(db, teacherId, parentSession.class_id)) {
      throw classroomError("SESSION_NOT_FOUND", "课堂场次不存在", 404, false);
    }
  }

  function assertAllowableTransition(session, nextStatus) {
    const allowed = ALLOWED_TRANSITIONS[session.status];
    if (!allowed || !allowed.has(nextStatus)) {
      throw classroomError("INVALID_SESSION_TRANSITION", "不允许的操作", 409, false);
    }
  }

  function expireIfNeeded(session) {
    if (session.status !== "live") return session;
    const activeSeconds = computeActiveSeconds(session, now());
    const maxSeconds = session.duration_minutes * 60;
    if (activeSeconds >= maxSeconds) {
      const activeStartedMs = session.active_started_at ? Date.parse(session.active_started_at) : now();
      const elapsed = Math.max(0, Math.floor((now() - activeStartedMs) / 1000));
      return repository.transition(session.id, "live", "ended", {
        accumulatedActiveSeconds: session.accumulated_active_seconds + elapsed,
        endedAt: new Date(now()).toISOString(),
      }) ?? session;
    }
    return session;
  }

  function freezeSessionReport(session) {
    const overview = repository.getOverview(session.id);
    const studentReports = overview.students.map((student) => {
      const result = safeJson(student.result_json);
      return {
        studentId: student.student_id,
        displayName: student.display_name,
        status: student.status,
        xp: student.xp,
        stars: student.stars,
        badges: calculateBadges(result?.passedStageIds ?? []),
        averageScore: result?.averageScore ?? 0,
      };
    });
    const completedCount = studentReports.filter((s) => s.status === "completed").length;
    const passCount = studentReports.filter((s) => s.stars >= 1).length;
    const report = {
      frozenAt: new Date(now()).toISOString(),
      totalStudents: overview.students.length,
      completedStudents: completedCount,
      passedStudents: passCount,
      averageScore: studentReports.reduce((sum, s) => sum + s.averageScore, 0) / (studentReports.length || 1),
      studentReports,
    };
    repository.freezeReport(session.id, report);
    return report;
  }

  return {
    createDraft({ teacherId, classId, config }) {
      if (!teacherOwnsClass(db, teacherId, classId)) {
        throw classroomError("SESSION_NOT_FOUND", "课堂场次不存在", 404, false);
      }
      const validated = validateClassroomSessionConfig(config);
      const mission = getClassroomMission(validated.templateKey, validated.templateVersion);
      return repository.createDraft({
        classId,
        teacherId,
        templateKey: validated.templateKey,
        templateVersion: validated.templateVersion,
        title: mission.title,
        durationMinutes: validated.durationMinutes,
        passScore: validated.passScore,
        allowMakeup: validated.allowMakeup,
        configJson: JSON.stringify(validated),
      });
    },

    start({ teacherId, sessionId }) {
      const session = repository.getById(sessionId);
      if (!session) throw classroomError("SESSION_NOT_FOUND", "课堂场次不存在", 404, false);
      assertTeacherOwns(session, teacherId);
      const fresh = expireIfNeeded(session);
      if (fresh.status !== session.status) {
        throw classroomError("SESSION_ENDED", "课堂已自动结束", 409, false);
      }
      assertAllowableTransition(fresh, "live");
      const conflicts = repository.findActiveConflictsForClass(fresh.class_id, fresh.id);
      if (conflicts.length > 0) {
        const err = classroomError("ACTIVE_SESSION_CONFLICT", "有学生在其他活动课堂中", 409, false);
        err.conflicts = conflicts;
        throw err;
      }
      return repository.transition(fresh.id, "draft", "live", {
        startedAt: new Date(now()).toISOString(),
        activeStartedAt: new Date(now()).toISOString(),
        accumulatedActiveSeconds: 0,
      });
    },

    pause({ teacherId, sessionId }) {
      const session = repository.getById(sessionId);
      if (!session) throw classroomError("SESSION_NOT_FOUND", "课堂场次不存在", 404, false);
      assertTeacherOwns(session, teacherId);
      const fresh = expireIfNeeded(session);
      if (fresh.status !== session.status) {
        throw classroomError("SESSION_ENDED", "课堂已自动结束", 409, false);
      }
      if (fresh.status === "ended") {
        throw classroomError("SESSION_ENDED", "课堂已结束", 409, false);
      }
      assertAllowableTransition(fresh, "paused");
      const activeSeconds = computeActiveSeconds(fresh, now());
      return repository.transition(fresh.id, fresh.status, "paused", {
        accumulatedActiveSeconds: activeSeconds,
        pausedAt: new Date(now()).toISOString(),
        activeStartedAt: null,
      });
    },

    resume({ teacherId, sessionId }) {
      const session = repository.getById(sessionId);
      if (!session) throw classroomError("SESSION_NOT_FOUND", "课堂场次不存在", 404, false);
      assertTeacherOwns(session, teacherId);
      assertAllowableTransition(session, "live");
      return repository.transition(session.id, "paused", "live", {
        activeStartedAt: new Date(now()).toISOString(),
      });
    },

    end({ teacherId, sessionId }) {
      const session = repository.getById(sessionId);
      if (!session) throw classroomError("SESSION_NOT_FOUND", "课堂场次不存在", 404, false);
      assertTeacherOwns(session, teacherId);
      const fresh = expireIfNeeded(session);
      if (fresh.status === "ended") {
        const report = fresh.report_json ? safeJson(fresh.report_json) : null;
        return { session: fresh, report };
      }
      assertAllowableTransition(fresh, "ended");
      const activeSeconds = computeActiveSeconds(fresh, now());
      const ended = repository.transition(fresh.id, fresh.status, "ended", {
        accumulatedActiveSeconds: activeSeconds,
        endedAt: new Date(now()).toISOString(),
      });
      if (!ended) throw classroomError("SESSION_NOT_FOUND", "课堂场次不存在", 404, false);
      const report = freezeSessionReport(ended);
      return { session: repository.getById(sessionId), report };
    },

    getStudentCurrent({ studentId }) {
      const session = repository.findCurrentForStudent(studentId);
      if (!session) return { session: null };
      const fresh = expireIfNeeded(session);
      if (fresh.status === "ended") {
        return { session: null };
      }
      const studentState = repository.getStudentState(fresh.id, studentId) ?? null;
      const mission = getClassroomMission(fresh.template_key, fresh.template_version);
      const remainingSeconds = fresh.status === "live"
        ? Math.max(0, fresh.duration_minutes * 60 - computeActiveSeconds(fresh, now()))
        : fresh.duration_minutes * 60 - (fresh.accumulated_active_seconds ?? 0);
      return { session: fresh, studentState, mission, remainingSeconds };
    },

    enterStudent({ studentId, sessionId }) {
      const session = repository.getById(sessionId);
      if (!session) throw classroomError("SESSION_NOT_FOUND", "课堂场次不存在", 404, false);
      const fresh = expireIfNeeded(session);
      if (fresh.status === "ended") throw classroomError("SESSION_ENDED", "课堂已结束", 409, false);
      if (fresh.status !== "live" && fresh.status !== "paused") {
        throw classroomError("SESSION_NOT_FOUND", "课堂场次不存在", 404, false);
      }
      const studentState = repository.enterStudent(fresh.id, studentId);
      const mission = getClassroomMission(fresh.template_key, fresh.template_version);
      return { session: fresh, studentState, mission };
    },

    submitAttempt({ studentId, payload }) {
      const session = repository.findCurrentForStudent(studentId);
      if (!session) {
        // No active session — return null classroomSession, let caller handle as ordinary practice
        return { session: null };
      }
      const fresh = expireIfNeeded(session);
      if (fresh.status === "ended") {
        return { session: null };
      }
      if (fresh.status === "paused") {
        throw classroomError("SESSION_PAUSED", "课堂任务已暂停，请等待教师恢复。", 409, true);
      }
      if (!payload.clientSubmissionId) {
        throw classroomError("SESSION_NOT_FOUND", "课堂提交需要 clientSubmissionId", 400, false);
      }
      const duplicate = repository.findDuplicateAttempt(studentId, payload.clientSubmissionId);
      if (duplicate) {
        const studentState = repository.getStudentState(fresh.id, studentId);
        return {
          session: fresh,
          studentState,
          duplicateResult: { ...safeJson(duplicate.result_json), passed: Boolean(duplicate.passed) },
        };
      }
      const studentState = repository.getStudentState(fresh.id, studentId);
      const stageIndex = studentState?.current_stage_index ?? 0;
      const mission = getClassroomMission(fresh.template_key, fresh.template_version);
      const currentProgress = {}; // classroom grading doesn't need full progress
      const graded = gradeClassroomEvidence({ mission, stageIndex, payload, progress: currentProgress });
      if (!graded.ok && graded.ok !== undefined) {
        throw classroomError("INVALID_STAGE_EVIDENCE", graded.error, graded.status, false);
      }
      // Use the existing recordStudentAttempt with sessionId and clientSubmissionId
      const progress = recordStudentAttempt(
        db,
        studentId,
        graded.challengeId,
        graded.result,
        { sessionId: fresh.id, clientSubmissionId: payload.clientSubmissionId, inTransaction: true },
      );
      // Calculate updated rewards
      const allStageScores = mission.stages.map((stage, index) => {
        if (index < stageIndex) {
          const previousResult = safeJson(studentState.result_json);
          return previousResult?.stageScores?.[index] ?? 0;
        }
        if (index === stageIndex) return graded.result.score;
        return NaN;
      });
      const completedStages = allStageScores.filter((s) => Number.isFinite(s));
      const passedStageIds = mission.stages.filter((stage, index) =>
        index < stageIndex || (index === stageIndex && graded.result.passed)
      ).map((s) => s.id);
      const rewards = calculateRewards({
        stageScores: allStageScores,
        firstAttemptPasses: allStageScores.map((s, i) => i < stageIndex || (i === stageIndex && graded.result.passed)),
        stageAttempts: allStageScores.map(() => 1),
        streak: studentState.streak + (graded.result.passed ? 1 : 0),
        passScore: fresh.pass_score,
      });
      const badges = calculateBadges(passedStageIds);
      const nextStageIndex = graded.result.passed ? stageIndex + 1 : stageIndex;
      const allDone = nextStageIndex >= mission.stages.length;
      const updated = repository.updateStudentAfterAttempt({
        sessionId: fresh.id,
        studentId,
        status: allDone ? "completed" : "in_progress",
        currentStageIndex: nextStageIndex,
        xp: rewards.xp,
        stars: rewards.stars,
        streak: graded.result.passed ? studentState.streak + 1 : 0,
        result: { stageScores: allStageScores, passedStageIds, badges, averageScore: rewards.average },
        completedAt: allDone ? new Date(now()).toISOString() : null,
      });
      return {
        session: repository.getById(fresh.id),
        studentState: updated,
        progress,
        summary: { ...rewards, badges },
      };
    },

    getTeacherOverview({ teacherId, sessionId }) {
      const session = repository.getById(sessionId);
      if (!session) throw classroomError("SESSION_NOT_FOUND", "课堂场次不存在", 404, false);
      assertTeacherOwns(session, teacherId);
      const fresh = expireIfNeeded(session);
      const overview = repository.getOverview(fresh.id);
      return {
        session: fresh,
        students: overview.students.map((s) => ({
          studentId: s.student_id,
          displayName: s.display_name,
          username: s.username,
          status: s.status,
          currentStageIndex: s.current_stage_index,
          xp: s.xp,
          stars: s.stars,
          streak: s.streak,
          lastActivityAt: s.last_activity_at,
          completedAt: s.completed_at,
          result: safeJson(s.result_json),
        })),
        updatedAt: fresh.updated_at,
      };
    },

    getReport({ teacherId, sessionId }) {
      const session = repository.getById(sessionId);
      if (!session) throw classroomError("SESSION_NOT_FOUND", "课堂场次不存在", 404, false);
      assertTeacherOwns(session, teacherId);
      if (session.status !== "ended" || !session.report_json) {
        throw classroomError("SESSION_NOT_ENDED", "课堂报告尚未生成", 409, false);
      }
      return safeJson(session.report_json);
    },
  };
}

function safeJson(value) {
  try { return value ? JSON.parse(value) : null; }
  catch { return null; }
}
