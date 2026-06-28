import express from 'express';
import morgan from 'morgan';
import { createPod } from '../kubernetes/pod.js'; 
import { createService } from '../kubernetes/service.js';
import { v7 as uuid} from 'uuid';
import { createSandboxKey } from '../config/redis.js';
import cookieParser from 'cookie-parser';
import sandboxRouter from '../routes/sandbox.routes.js';
import { errorHandler } from '../middleware/error.middleware.js';

const app = express();
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());


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

app.post("/api/sandbox/start" , async (req , res, next) =>{
    try {
        const sandboxId = uuid();

        await Promise.all([
            createPod(sandboxId),
            createService(sandboxId),
            createSandboxKey(sandboxId)
        ])

        res.status(201).json({
            status : "success",
            message : `Sandbox with ID ${sandboxId} created successfully`,
            previewUrl : `http://${sandboxId}.preview.localhost`,
            agentUrl : `http://${sandboxId}.agent.localhost/api/agent/list-files`
        })
    } catch (err) {
        next(err);
    }
})

// Register global error handler middleware
app.use(errorHandler);

export default app;
