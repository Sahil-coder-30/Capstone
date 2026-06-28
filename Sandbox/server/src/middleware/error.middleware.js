export const errorHandler = (err, req, res, next) => {
    console.error("Error encountered in Sandbox API:", err);

    // If headers have already been sent to the client, delegate to the default Express error handler
    if (res.headersSent) {
        return next(err);
    }

    const statusCode = err.statusCode || err.status || 500;
    const message = err.message || "Internal Server Error";

    res.status(statusCode).json({
        status: "error",
        message: message,
        ...(process.env.NODE_ENV === "development" && { stack: err.stack })
    });
};
