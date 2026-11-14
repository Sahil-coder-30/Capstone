import express from 'express';
import morgan from 'morgan';
import sandboxRouter from '../routes/sandbox.routes.js';
import internalRouter from '../routes/internal.routes.js';
import { errorHandler } from '../middleware/error.middleware.js';

const app = express();
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.get("/api/sandbox/health" , (req , res) => {
    res.status(200).json({        
        status : "ok",
        message : "Sandbox API is working fine"
    })
})

app.get("/api/sandbox/ready" , (req , res) =>{
    res.status(200).json({
        status : "ready",
        message : "Sandbox API is ready to accept traffic"
    })
})

app.use('/api/sandbox' , sandboxRouter);

// Service-to-service routes for the sandbox router (not routed by the ingress).
app.use('/internal', internalRouter);

// Register global error handler middleware
app.use(errorHandler);

export default app;
