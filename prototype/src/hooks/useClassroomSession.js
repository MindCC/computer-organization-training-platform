import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../apiClient.js";
import { createRandomId } from "../shared/randomId.js";
import { useSessionScope } from './useSessionScope.js';
import {
  pendingSubmissionKey,
  readPendingSubmission,
  writePendingSubmission,
  clearPendingSubmission,
  buildClassroomViewModel,
  mergeClassroomSubmission,
} from "../classroomSessionState.js";

const POLL_MS = 15_000;

export function useClassroomSession({ userId, enabled, apiClient = api, storage = localStorage }) {
  const { scope, isCurrent } = useSessionScope(userId, enabled);
  const [scopedModel, updateModel] = useState(null);
  const viewModel = scopedModel?.scope === scope ? scopedModel.value : { active: false };
  const setViewModel = useCallback(value => {
    if (!isCurrent()) return;
    updateModel(previous => ({ scope, value: typeof value === 'function' ? value(previous?.scope === scope ? previous.value : { active: false }) : value }));
  }, [scope]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const polling = useRef(null);
  useEffect(() => { setError(null); setLoading(false); }, [scope]);

  const poll = useCallback(async () => {
    if (!enabled || !userId) return;
    try {
      const data = await apiClient.currentClassroom();
      if (!isCurrent()) return;
      if (data) {
        const { session, studentState, mission, remainingSeconds } = data;
        const vm = buildClassroomViewModel({ session, studentState, mission, remainingSeconds });
        setViewModel(vm);
        setError(null);
      }
    } catch (err) {
      if (!isCurrent()) return;
      if (err.code === "SESSION_NOT_FOUND") {
        setViewModel({ active: false });
      }
    }
  }, [enabled, userId, apiClient, scope, setViewModel]);

  useEffect(() => {
    if (!enabled || !userId) return;
    poll();
    const intervalId = setInterval(() => {
      if (document.visibilityState === "visible") poll();
    }, POLL_MS);
    polling.current = intervalId;
    return () => clearInterval(intervalId);
  }, [enabled, userId, poll]);

  const enter = useCallback(async (sessionId) => {
    if (!isCurrent()) throw new Error('请先登录学生账号');
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.enterClassroom(sessionId);
      const vm = buildClassroomViewModel(data);
      setViewModel(vm);
      return data;
    } catch (err) {
      if (isCurrent()) setError(err);
      throw err;
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [apiClient, scope, setViewModel]);

  const submit = useCallback(async (payload) => {
    if (!isCurrent()) throw new Error('学生账号已切换，请重新进入课堂');
    const clientSubmissionId = payload.clientSubmissionId ?? createRandomId("classroom");
    const submission = { ...payload, clientSubmissionId };
    const key = pendingSubmissionKey({
      userId,
      sessionId: viewModel.sessionId,
      stageId: viewModel.currentStage?.id ?? "unknown",
    });
    const pending = { clientSubmissionId, payload: submission };
    writePendingSubmission(storage, key, pending);
    setError(null);
    try {
      const result = submission.stageId
        ? await apiClient.completeClassroomStage(viewModel.sessionId,submission)
        : await apiClient.submitAttempt(submission);
      clearPendingSubmission(storage, key);
      if (result.classroomSession) {
        setViewModel((prev) => mergeClassroomSubmission(prev, result.classroomSession));
      }
      if(result.studentState)setViewModel(prev=>mergeClassroomSubmission(prev,result.studentState));
      return result;
    } catch (err) {
      if (err instanceof Error && err.retryable) {
        // Keep pending for retryable errors
      } else {
        clearPendingSubmission(storage, key);
      }
      if (isCurrent()) setError(err);
      throw err;
    }
  }, [apiClient, userId, viewModel.sessionId, viewModel.currentStage, storage, scope, setViewModel]);

  useEffect(() => {
    const handleOnline = async () => {
      if (!enabled || !userId || !isCurrent()) return;
      const stageId = viewModel.currentStage?.id;
      if (!stageId || !viewModel.sessionId) return;
      const key = pendingSubmissionKey({ userId, sessionId: viewModel.sessionId, stageId });
      const pending = readPendingSubmission(storage, key);
      if (!pending) return;
      try {
        const result = pending.payload.stageId
          ? await apiClient.completeClassroomStage(viewModel.sessionId,pending.payload)
          : await apiClient.submitAttempt(pending.payload);
        clearPendingSubmission(storage, key);
        if (result.classroomSession) {
          setViewModel((prev) => mergeClassroomSubmission(prev, result.classroomSession));
        }
        if(result.studentState)setViewModel(prev=>mergeClassroomSubmission(prev,result.studentState));
        if (isCurrent()) setError(null);
      } catch (err) {
        if (err.code === "SESSION_PAUSED" || err.code === "SESSION_ENDED" || err.code === "STAGE_MISMATCH") {
          clearPendingSubmission(storage, key);
        }
      }
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [enabled, userId, viewModel.sessionId, viewModel.currentStage, apiClient, storage, scope, setViewModel]);

  return { viewModel, loading, error, enter, submit, refresh: poll };
}
