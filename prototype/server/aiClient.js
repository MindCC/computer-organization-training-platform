export function readDeepSeekConfig(env = process.env) {
  const timeoutMs = Number(env.AI_REQUEST_TIMEOUT_MS ?? 15000);
  return {
    enabled: Boolean(env.DEEPSEEK_API_KEY),
    apiKey: env.DEEPSEEK_API_KEY ?? "",
    baseUrl: env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
    model: env.DEEPSEEK_MODEL ?? "deepseek-v4-flash",
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 15000,
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
        messages,
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
