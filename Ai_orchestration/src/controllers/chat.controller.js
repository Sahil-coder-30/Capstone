import ChatMessage from "../models/ChatMessage.model.js";

// GET /chats/:projectId/:agentType
export const getChats = async (req, res) => {
  const { projectId, agentType } = req.params;
  const userId = req.user?.id;

  if (!["codingAgent", "copilot"].includes(agentType)) {
    return res.status(400).json({ status: "error", message: "Invalid agentType" });
  }

  try {
    const messages = await ChatMessage.find({
      projectId,
      agentType,
      $or: [{ userId }, { userId: { $exists: false } }],
    }).sort({ timestamp: 1 });
    res.status(200).json({ status: "ok", messages });
  } catch (error) {
    console.error("Failed to retrieve chat history:", error);
    res.status(500).json({ status: "error", message: "Failed to retrieve chat history" });
  }
};

// DELETE /chats/:projectId/:agentType
export const deleteChats = async (req, res) => {
  const { projectId, agentType } = req.params;
  const userId = req.user?.id;

  if (!["codingAgent", "copilot"].includes(agentType)) {
    return res.status(400).json({ status: "error", message: "Invalid agentType" });
  }

  try {
    await ChatMessage.deleteMany({
      projectId,
      agentType,
      userId,
    });
    res.status(200).json({ status: "ok", message: `Chat history cleared for ${agentType}` });
  } catch (error) {
    console.error("Failed to clear chat history:", error);
    res.status(500).json({ status: "error", message: "Failed to clear chat history" });
  }
};
