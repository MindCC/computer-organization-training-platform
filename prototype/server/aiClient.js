const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-flash";
const DEFAULT_TIMEOUT_MS = 15000;
const ALLOWED_MESSAGE_ROLES = new Set(["user", "assistant"]);
const MAX_MESSAGE_CONTENT_LENGTH = 8000;

const FORBIDDEN_PAYLOAD_PATTERNS = [
  { label: "password hashes", pattern: /\bpassword[_-]?hash\b|\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}|\bscrypt[:$]/i },
  { label: "session tokens", pattern: /\bsession[_ -]?token\b|\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/i },
  { label: "cookies", pattern: /\bset-cookie\b|\bcookie\s*[:=]/i },
  { label: "request headers", pattern: /\bauthorization\s*[:=]|\bbearer\s+[A-Za-z0-9._~-]{20,}|\bx-[a-z0-9-]*api[-_]key\s*[:=]/i },
  { label: "API keys", pattern: /\bapi[_ -]?key\s*[:=]|\bsk-[A-Za-z0-9_-]{16,}\b/i },
  { label: "full student note content", pattern: /\b(student\s*)?notes?\s*[:=]|\bnote\s*content\s*[:=]|\breflection\s*[:=]|学生笔记|笔记内容|学习反思|课堂记录\s*[:：]/i },
];

function readNonBlankString(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim();
  return normalized ? normalized : fallback;
}

function assertSafeContent(content, indexLabel, maxLength) {
  if (content.length > maxLength) {
    throw createAiError("AI_RESPONSE", `${indexLabel} is too large for the AI boundary`);
  }

  for (const rule of FORBIDDEN_PAYLOAD_PATTERNS) {
    if (rule.pattern.test(content)) {
      throw createAiError("AI_RESPONSE", `Forbidden sensitive content detected in ${indexLabel}: ${rule.label}`);
    }
  }
}

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw createAiError("AI_RESPONSE", "Messages must be a non-empty array");
  }

  return messages.map((message, index) => {
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      throw createAiError("AI_RESPONSE", `Message ${index} must be an object`);
    }

    const { role, content } = message;
    if (role === "system") {
      throw createAiError("AI_RESPONSE", `Message ${index} contains a system role, which is not allowed`);
    }
    if (typeof role !== "string" || !ALLOWED_MESSAGE_ROLES.has(role)) {
      throw createAiError("AI_RESPONSE", `Message ${index} has an invalid role`);
    }
    if (typeof content !== "string" || !content.trim()) {
      throw createAiError("AI_RESPONSE", `Message ${index} content must be a non-empty string`);
    }

    const normalizedContent = content.trim();
    assertSafeContent(normalizedContent, `message ${index}`, MAX_MESSAGE_CONTENT_LENGTH);

    return {
      role,
      content: normalizedContent,
    };
  });
}

export function readDeepSeekConfig(env = process.env) {
  const timeoutMs = Number(env.AI_REQUEST_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const apiKey = readNonBlankString(env.DEEPSEEK_API_KEY, "");
  return {
    enabled: Boolean(apiKey),
    apiKey,
    baseUrl: readNonBlankString(env.DEEPSEEK_BASE_URL, DEFAULT_BASE_URL),
    model: readNonBlankString(env.DEEPSEEK_MODEL, DEFAULT_MODEL),
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS,
  };
}

export function createAiError(code, message, cause = null) {
  const error = new Error(message);
  error.code = code;
  error.cause = cause;
  return error;
}

export async function requestChatCompletion(config, messages, options = {}) {
  if (!config.enabled) {
    throw createAiError("AI_DISABLED", "DEEPSEEK_API_KEY is not configured");
  }

  const validatedMessages = validateMessages(messages);
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetchImpl(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: validatedMessages,
        stream: false,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw createAiError("AI_HTTP", `DeepSeek request failed with status ${response.status}`);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      throw createAiError("AI_RESPONSE", "DeepSeek response content is empty");
    }

    return content;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw createAiError("AI_TIMEOUT", "DeepSeek request timed out", error);
    }
    if (error?.code?.startsWith?.("AI_")) {
      throw error;
    }
    throw createAiError("AI_RESPONSE", "DeepSeek response parsing failed", error);
  } finally {
    clearTimeout(timer);
  }
}
