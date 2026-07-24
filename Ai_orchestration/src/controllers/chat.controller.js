import ChatMessage from "../models/ChatMessage.model.js";
import CopilotChatMessage from "../models/CopilotChatMessage.model.js";

// GET /chats/:projectId/:agentType
export const getChats = async (req, res) => {
  const { projectId, agentType } = req.params;
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ status: "error", message: "Unauthorized - Invalid user context" });
  }

  if (!["codingAgent", "copilot"].includes(agentType)) {
    return res.status(400).json({ status: "error", message: "Invalid agentType" });
  }

  try {
    let messages;
    if (agentType === "copilot") {
      messages = await CopilotChatMessage.find({
        projectId,
        deletionStatus: { $ne: "trash" },
        $or: [{ userId }, { userId: { $exists: false } }],
      }).sort({ timestamp: 1 });
    } else {
      messages = await ChatMessage.find({
        projectId,
        agentType: "codingAgent",
        deletionStatus: { $ne: "trash" },
        $or: [{ userId }, { userId: { $exists: false } }],
      }).sort({ timestamp: 1 });
    }

    res.status(200).json({ status: "ok", messages });
  } catch (error) {
    console.error("Failed to retrieve chat history:", error);
    res.status(500).json({ status: "error", message: "Failed to retrieve chat history" });
  }
};

// DELETE /chats/:projectId/:agentType (Soft Delete all active chats for project)
export const deleteChats = async (req, res) => {
  const { projectId, agentType } = req.params;
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ status: "error", message: "Unauthorized - Invalid user context" });
  }

  if (!["codingAgent", "copilot"].includes(agentType)) {
    return res.status(400).json({ status: "error", message: "Invalid agentType" });
  }

  try {
    const now = new Date();
    if (agentType === "copilot") {
      await CopilotChatMessage.updateMany(
        { projectId, deletionStatus: { $ne: "trash" }, $or: [{ userId }, { userId: { $exists: false } }] },
        { $set: { deletionStatus: "trash", deletedAt: now } }
      );
    } else {
      await ChatMessage.updateMany(
        { projectId, agentType: "codingAgent", deletionStatus: { $ne: "trash" }, $or: [{ userId }, { userId: { $exists: false } }] },
        { $set: { deletionStatus: "trash", deletedAt: now } }
      );
    }

    res.status(200).json({ status: "ok", message: `Chat history moved to trash for ${agentType}` });
  } catch (error) {
    console.error("Failed to move chat history to trash:", error);
    res.status(500).json({ status: "error", message: "Failed to move chat history to trash" });
  }
};

// DELETE /chats/message/:messageId (Soft Delete single or batch messages/reports)
export const deleteSingleChatMessage = async (req, res) => {
  const { messageId } = req.params;
  const { agentType } = req.query;

  try {
    const now = new Date();
    const rawIds = (messageId || "").split(",");
    const validObjectIds = rawIds.map(id => id.trim()).filter(id => id && mongoose.Types.ObjectId.isValid(id));

    if (validObjectIds.length > 0) {
      if (agentType === "copilot") {
        await CopilotChatMessage.updateMany(
          { _id: { $in: validObjectIds } },
          { $set: { deletionStatus: "trash", deletedAt: now } }
        );
      } else {
        await ChatMessage.updateMany(
          { _id: { $in: validObjectIds } },
          { $set: { deletionStatus: "trash", deletedAt: now } }
        );
      }
    }

    res.status(200).json({ status: "ok", message: "Message(s) moved to trash" });
  } catch (error) {
    console.error("Failed to delete message(s):", error);
    res.status(500).json({ status: "error", message: "Failed to delete message(s)" });
  }
};

// GET /chats/trash
export const getTrashChats = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ status: "error", message: "Unauthorized" });
  }

  try {
    const agentChats = await ChatMessage.find({
      $or: [{ userId }, { userId: { $exists: false } }],
      deletionStatus: "trash",
    }).sort({ deletedAt: -1 });

    const copilotChats = await CopilotChatMessage.find({
      $or: [{ userId }, { userId: { $exists: false } }],
      deletionStatus: "trash",
    }).sort({ deletedAt: -1 });

    res.status(200).json({
      status: "ok",
      trashMessages: [
        ...agentChats.map((c) => ({ ...c.toObject(), agentType: "codingAgent" })),
        ...copilotChats.map((c) => ({ ...c.toObject(), agentType: "copilot" })),
      ],
    });
  } catch (error) {
    console.error("Failed to retrieve trashed chats:", error);
    res.status(500).json({ status: "error", message: "Failed to retrieve trashed chats" });
  }
};

// PATCH /chats/message/:messageId/restore
export const restoreChatMessage = async (req, res) => {
  const { messageId } = req.params;
  const { agentType } = req.body;

  try {
    if (agentType === "copilot") {
      await CopilotChatMessage.findByIdAndUpdate(messageId, {
        deletionStatus: "active",
        deletedAt: null,
      });
    } else {
      await ChatMessage.findByIdAndUpdate(messageId, {
        deletionStatus: "active",
        deletedAt: null,
      });
    }

    res.status(200).json({ status: "ok", message: "Message restored successfully" });
  } catch (error) {
    console.error("Failed to restore chat message:", error);
    res.status(500).json({ status: "error", message: "Failed to restore message" });
  }
};

// DELETE /chats/message/:messageId/permanent
export const permanentlyDeleteChatMessage = async (req, res) => {
  const { messageId } = req.params;
  const { agentType } = req.query;

  try {
    if (agentType === "copilot") {
      await CopilotChatMessage.findByIdAndDelete(messageId);
    } else {
      await ChatMessage.findByIdAndDelete(messageId);
    }

    res.status(200).json({ status: "ok", message: "Message permanently deleted" });
  } catch (error) {
    console.error("Failed to permanently delete chat message:", error);
    res.status(500).json({ status: "error", message: "Failed to delete message" });
  }
};
