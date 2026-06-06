import express from 'express';
import morgan from 'morgan';
import fs from 'fs';

const app = express();

app.use(morgan('dev'));

const WORKING_DIR = "/workspace";

app.get("/api/agent/health" , (req , res) => {
    res.status(200).json({        
        status : "ok",
        message : "Agent API is working fine"
    })
})

app.get("/api/agent/ready" , (req , res) =>{
    res.status(200).json({
        status : "ready",
        message : "Agent API is ready to accept traffic"
    })
})

app.get("/api/agent/list-files" ,async (req , res) => {

    const files = await fs.promises.readdir(WORKING_DIR);

    res.status(200).json({
        status : "ok",
        files : files
    })
})

export default app;