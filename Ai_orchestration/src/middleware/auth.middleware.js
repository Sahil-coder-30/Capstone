import jwt from "jsonwebtoken";

export const identifyUser = async (req, res, next) => {
  try {
    // 1. Try to extract token from cookies
    let token = req.cookies?.token;

    // 2. Fallback: try to extract from Authorization header
    if (!token && req.headers.authorization) {
      const parts = req.headers.authorization.split(" ");
      if (parts[0] === "Bearer" && parts[1]) {
        token = parts[1];
      }
    }

    if (!token) {
      return res.status(401).json({
        status: "error",
        message: "Unauthorized - No token provided",
      });
    }

    // 3. Verify the token using process.env.JWT_SECRET
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decodedToken; // Will contain { id: user._id }
    next();
  } catch (err) {
    console.error("JWT verification failed:", err.message);
    return res.status(401).json({
      status: "error",
      message: "Unauthorized - Invalid or expired token",
    });
  }
};
