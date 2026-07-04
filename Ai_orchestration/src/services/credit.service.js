import axios from "axios";

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || "http://auth-service";

const buildAuthHeaders = (authToken) => {
  const headers = {};
  if (authToken) {
    headers.Cookie = `token=${authToken}`;
    headers.Authorization = `Bearer ${authToken}`;
  }
  return headers;
};

export const checkAiCredit = async ({ authToken, company, provider }) => {
  const normalizedCompany = company || provider || "unknown";
  const response = await axios.get(`${AUTH_SERVICE_URL}/api/auth/credit/check`, {
    headers: buildAuthHeaders(authToken),
    params: { company: normalizedCompany },
    timeout: 5_000,
  });

  return response.data;
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

  const response = await axios.post(`${AUTH_SERVICE_URL}/api/auth/credit/update`, {
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
};
