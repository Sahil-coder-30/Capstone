import express from 'express';
import morgan from 'morgan';
import { createPod } from '../kubernetes/pod.js'; 
import { createService } from '../kubernetes/service.js';
import { v7 as uuid} from 'uuid';

const app = express();
app.use(morgan('dev'));


app.get("/api/sandbox/health" , (req , res) => {
    res.status(200).json({        
        status : "ok",
        message : "Sandbox API is working fine"
    })
})

app.post("/api/sandbox/start" , async (req , res) =>{

    const sandboxId = uuid();

    await Promise.all([
        createPod(sandboxId),
        createService(sandboxId)
    ])

    res.status(201).json({
        status : "success",
        message : `Sandbox with ID ${sandboxId} created successfully`,
        previewUrl : `http://${sandboxId}.preview.localhost`
    })

})


export default app;
