import jwt from "jsonwebtoken";
import { isBlacklisted } from "../config/redis.js";

export const identifyUser = async (req, res, next) => {
  try {
    let token = req.cookies?.accessToken || req.cookies?.token;

    if (!token && req.headers.authorization) {
      const [scheme, value] = req.headers.authorization.split(" ");
      if (scheme?.toLowerCase() === "bearer" && value) token = value;
    }

    if (!token) {
      return res.status(401).json({
        status: "error",
        message: "Unauthorized - No token provided",
      });
    }

    const decodedToken = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

    if (await isBlacklisted(token)) {
      return res.status(401).json({
        status: "error",
        message: "Unauthorized - Token has been revoked",
      });
    }

    req.user = decodedToken;
    req.authToken = token;
    next();
  } catch (err) {
    console.error("JWT verification failed:", err.message);
    return res.status(401).json({
      status: "error",
      message: "Unauthorized - Invalid or expired token",
    });
  }
};