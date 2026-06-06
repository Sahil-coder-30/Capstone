import express from 'express';
import morgan from 'morgan';

import { createProxyMiddleware } from 'http-proxy-middleware';


const app = express();
app.use(morgan('combined'));

app.get("/api/router/health" , (req , res) => {
    res.status(200).json({        
        status : "ok",
        message : "Sandbox API is working fine"
    })
})

app.get("/api/router/ready" , (req , res) =>{
    res.status(200).json({
        status : "ready",
        message : "Sandbox API is ready to accept traffic"
    })
})

const proxyies = {};

    const getProxyies = (sandboxId) => {
        if(!proxyies[sandboxId]){
            proxyies[sandboxId] = createProxyMiddleware({
                target: `http://sandbox-service-${sandboxId}`,
                changeOrigin: true,
                ws: true,
            });
        }
        return proxyies[sandboxId];
    };


app.use((req, res , next) => {

    const host = req.headers.host;
    const sandboxId = host.split('.')[0];

    
    return getProxyies(sandboxId)(req , res, next);

})


export default app;