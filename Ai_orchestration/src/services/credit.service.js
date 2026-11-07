import axios from "axios";

// The one place that decides where Payments is (also used by creditLedger).
export const PAYMENTS_SERVICE_URL = process.env.PAYMENTS_SERVICE_URL || process.env.PAYMENT_SERVICE_URL || "http://payments-service";

const buildAuthHeaders = (authToken) => {
  const headers = {};
  if (authToken) {
    headers.Cookie = `token=${authToken}`;
    headers.Authorization = `Bearer ${authToken}`;
  }
  return headers;
};

export const recordAiUsage = async ({
  authToken,
  userId,
  company,
  provider,
  modelId,
  agentType,
  projectId,
  requestId,
  promptTokens = 0,
  completionTokens = 0,
  totalTokens,
}) => {
  const totalTokenCount = totalTokens ?? (promptTokens + completionTokens);
  if (!userId || totalTokenCount <= 0) return null;

  try {
    const response = await axios.post(`${PAYMENTS_SERVICE_URL}/api/payments/credit/update`, {
      userId,
      company: company || provider || "unknown",
      modelId,
      agentType,
      projectId,
      requestId,
      promptTokens,
      completionTokens,
      totalTokens: totalTokenCount,
    }, {
      headers: buildAuthHeaders(authToken),
      timeout: 5_000,
    });

    return response.data;
  } catch (err) {
    console.error(`[recordAiUsage] Warning: Failed to record credit usage (${err.message}).`);
    return null;
  }
};
