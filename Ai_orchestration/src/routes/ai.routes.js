import { Router } from "express";
import agent from "../agent/code.agent.js";

const aiRouter = Router();

aiRouter.post("/invoke", async (req, res) => {

    const { message , projectId } = req.body;

    if (!message) {
        return res.status(400).json({ error: "message is required" });
    }

    try {
        const response = await agent.invoke(
            {
                messages: [
                    {
                        role: "user",
                        content: message,
                    },
                ],
            },
            {
                configurable: { projectId },
                recursionLimit: 200,
            }
        );

        // Extract the final AI message from the response
        const lastMessage = response.messages.at(-1);
        res.status(200).json({
            response: lastMessage.content,
        });

    } catch (error) {
        res.status(500).json({
            error: {
                message: error.message || "Internal server error",
                code: error.lc_error_code || null,
            },
        });
    }
});

export default aiRouter;