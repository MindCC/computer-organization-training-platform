export function publishTaskAssistantStatus(classroom,studentId,status,conversationId) {
  if(!classroom)return;
  window.dispatchEvent(new CustomEvent('task-assistant-status',{detail:{...classroom,studentId,status,conversationId}}));
}
