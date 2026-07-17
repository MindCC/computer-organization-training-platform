import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../apiClient.js";
import {
  pendingSubmissionKey,
  readPendingSubmission,
  writePendingSubmission,
  clearPendingSubmission,
} from "../classroomSessionState.js";

const POLL_MS = 15_000;

export function useClassroomSession({ userId, enabled, apiClient = api, storage = localStorage }) {
  const [viewModel, setViewModel] = useState({ active: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const polling = useRef(null);

  const poll = useCallback(async () => {
    if (!enabled || !userId) return;
    try {
      const data = await apiClient.currentClassroom();
      if (data) {
        const { session, studentState, mission, remainingSeconds } = data;
        const vm = buildLocalViewModel({ session, studentState, mission, remainingSeconds });
        setViewModel(vm);
        setError(null);
      }
    } catch (err) {
      if (err.code === "SESSION_NOT_FOUND") {
        setViewModel({ active: false });
      }
    }
  }, [enabled, userId, apiClient]);

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
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.enterClassroom(sessionId);
      const vm = buildLocalViewModel(data);
      setViewModel(vm);
      return data;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [apiClient]);

  const submit = useCallback(async (payload) => {
    const clientSubmissionId = payload.clientSubmissionId ?? crypto.randomUUID();
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
      const result = await apiClient.submitAttempt(submission);
      clearPendingSubmission(storage, key);
      if (result.classroomSession) {
        setViewModel((prev) => ({
          ...prev,
          studentStatus: result.classroomSession.status,
          xp: result.classroomSession.xp,
          stars: result.classroomSession.stars,
          streak: result.classroomSession.streak,
        }));
      }
      return result;
    } catch (err) {
      if (err instanceof Error && err.retryable) {
        // Keep pending for retryable errors
      } else {
        clearPendingSubmission(storage, key);
      }
      setError(err);
      throw err;
    }
  }, [apiClient, userId, viewModel.sessionId, viewModel.currentStage, storage]);

  useEffect(() => {
    const handleOnline = async () => {
      if (!enabled || !userId) return;
      const stageId = viewModel.currentStage?.id;
      if (!stageId || !viewModel.sessionId) return;
      const key = pendingSubmissionKey({ userId, sessionId: viewModel.sessionId, stageId });
      const pending = readPendingSubmission(storage, key);
      if (!pending) return;
      try {
        const result = await apiClient.submitAttempt(pending.payload);
        clearPendingSubmission(storage, key);
        if (result.classroomSession) {
          setViewModel((prev) => ({
            ...prev,
            studentStatus: result.classroomSession.status,
            xp: result.classroomSession.xp,
            stars: result.classroomSession.stars,
          }));
        }
        setError(null);
      } catch (err) {
        if (err.code === "SESSION_PAUSED" || err.code === "SESSION_ENDED" || err.code === "STAGE_MISMATCH") {
          clearPendingSubmission(storage, key);
        }
      }
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [enabled, userId, viewModel.sessionId, viewModel.currentStage, apiClient, storage]);

  return { viewModel, loading, error, enter, submit, refresh: poll };
}

function buildLocalViewModel({ session, studentState, mission, remainingSeconds }) {
  if (!session) return { active: false };
  const stageIndex = studentState?.current_stage_index ?? 0;
  const currentStage = mission?.stages?.[stageIndex] ?? null;
  return {
    active: true,
    sessionId: session.id,
    title: session.title ?? mission?.title,
    status: session.status,
    paused: session.status === "paused",
    ended: session.status === "ended",
    stageIndex,
    currentStage,
    remainingSeconds: Math.max(0, remainingSeconds ?? 0),
    xp: studentState?.xp ?? 0,
    stars: studentState?.stars ?? 0,
    streak: studentState?.streak ?? 0,
    studentStatus: studentState?.status ?? "not_started",
    mission,
  };
}
