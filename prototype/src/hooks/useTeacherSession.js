import { useState, useEffect, useCallback } from "react";
import { api } from "../apiClient.js";
import { useSessionScope } from './useSessionScope.js';
import { readSessionLessonPlan } from '../classroomSessionState.js';
import { missionForSession } from '../shared/classroomMissionRuntime.js';

const POLL_MS = 15_000;

export function useTeacherSession({ classId, enabled, apiClient = api }) {
  const { scope, isCurrent } = useSessionScope(classId, enabled);
  const [scopedModel, updateModel] = useState(null);
  const viewModel = scopedModel?.scope === scope ? scopedModel.value : { active: false };
  const setViewModel = useCallback(value => {
    if (!isCurrent()) return;
    updateModel(previous => ({ scope, value: typeof value === 'function' ? value(previous?.scope === scope ? previous.value : { active: false }) : value }));
  }, [scope]);
  const [error, setError] = useState(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  useEffect(() => { setError(null); setLastUpdatedAt(null); }, [scope]);

  const loadOverview = useCallback(async (sessionId) => {
    if (!isCurrent()) return;
    try {
      const data = await apiClient.classroomOverview(sessionId);
      if (!isCurrent()) return;
      const vm = buildTeacherVm(data);
      setViewModel(vm);
      // 只有真正变化才写 state：每轮轮询都写一个新字符串会触发无谓重渲染。
      const nextUpdatedAt = data.updatedAt ?? new Date().toISOString();
      setLastUpdatedAt((current) => (current === nextUpdatedAt ? current : nextUpdatedAt));
      setError(null);
    } catch (err) {
      if (!isCurrent()) return;
      // Keep stale data on error, just mark the error
      setError(err);
    }
  }, [apiClient, scope, setViewModel]);

  const createSession = useCallback(async (config) => {
    if (!classId || !isCurrent()) throw new Error("请先选择当前班级");
    setError(null);
    try {
      const data = await apiClient.createClassroomSession(classId, config);
      return data.session;
    } catch (err) {
      if (isCurrent()) setError(err);
      throw err;
    }
  }, [apiClient, classId, scope]);

  const updateDraft = useCallback(async (sessionId,config) => {
    const data=await apiClient.updateClassroomSession(sessionId,config);
    await loadOverview(sessionId);
    return data.session;
  },[apiClient,loadOverview]);

  const control = useCallback(async (sessionId, action) => {
    if (!isCurrent()) return;
    setError(null);
    try {
      const method = {
        start: apiClient.startClassroomSession,
        pause: apiClient.pauseClassroomSession,
        resume: apiClient.resumeClassroomSession,
        end: apiClient.endClassroomSession,
      }[action];
      if (!method) throw new Error("未知操作");
      const result = await method(sessionId);
      if (!isCurrent()) return result;
      if (action === "end") {
        setViewModel((prev) => ({ ...prev, status: "ended", ended: true }));
        return result;
      }
      const session = result.session;
      setViewModel((prev) => ({ ...prev, status: session.status, paused: session.status === "paused" }));
      return result;
    } catch (err) {
      if (isCurrent()) setError(err);
      throw err;
    }
  }, [apiClient, scope, setViewModel]);

  const loadReport = useCallback(async (sessionId) => {
    setError(null);
    try {
      return await apiClient.classroomReport(sessionId);
    } catch (err) {
      if (isCurrent()) setError(err);
      throw err;
    }
  }, [apiClient, scope]);

  // 恢复进行中的课堂：教师刷新页面后必须能重新挂上此前的直播课堂，
  // 否则看板退回“创建课堂任务”面板，进行中的课堂就此失联。
  const restoreCurrentSession = useCallback(async () => {
    if (!classId || !isCurrent()) return;
    try {
      const data = await apiClient.currentClassroomSession(classId);
      if (!isCurrent()) return;
      if (!data?.session) {
        setViewModel({ active: false });
        return;
      }
      const session = data.session;
      setViewModel((prev) => ({
        ...prev,
        active: true,
        sessionId: session.id,
        title: session.title,
        session,
        mission: missionForSession(session),
        lessonPlan: readSessionLessonPlan(session),
        status: session.status,
        paused: session.status === "paused",
        ended: session.status === "ended",
      }));
      setError(null);
    } catch (err) {
      if (isCurrent()) setError(err);
    }
  }, [apiClient, classId, scope, setViewModel]);

  useEffect(() => {
    if (!enabled) return;
    restoreCurrentSession();
  }, [enabled, restoreCurrentSession]);

  // Poll overview when a session is active
  useEffect(() => {
    if (!enabled || !viewModel.active || !viewModel.sessionId) return;
    if (viewModel.ended) return;
    const intervalId = setInterval(() => {
      if (document.visibilityState === "visible") {
        loadOverview(viewModel.sessionId);
      }
    }, POLL_MS);
    return () => clearInterval(intervalId);
  }, [enabled, viewModel.active, viewModel.sessionId, viewModel.ended, loadOverview]);

  // Initial load when session becomes active
  useEffect(() => {
    if (!enabled || !viewModel.active || !viewModel.sessionId) return;
    if (viewModel.ended) return;
    loadOverview(viewModel.sessionId);
  }, [enabled, viewModel.active, viewModel.sessionId, viewModel.ended, loadOverview]);

  return {
    classId,
    viewModel,
    setViewModel,
    error,
    lastUpdatedAt,
    createSession,
    updateDraft,
    control,
    loadOverview,
    loadReport,
  };
}

function buildTeacherVm(data) {
  if (!data || !data.session) return { active: false };
  const { session, students, updatedAt, mission } = data;
  const stageBuckets = { not_started: [], in_progress: [], completed: [] };
  for (const student of (students ?? [])) {
    const bucket = stageBuckets[student.status] ?? stageBuckets.in_progress;
    bucket.push(student);
  }
  const needsHelp = (students ?? []).filter((s) => s.status === "in_progress" && (s.result?.stageAttempts?.[s.currentStageIndex]??0)>1);
  return {
    active: true,
    sessionId: session.id,
    title: session.title,
    session,
    mission: mission ?? missionForSession(session),
    lessonPlan: readSessionLessonPlan(session),
    status: session.status,
    paused: session.status === "paused",
    ended: session.status === "ended",
    stageBuckets,
    students: students ?? [],
    needsHelp,
    updatedAt: updatedAt ?? session.updated_at,
  };
}
