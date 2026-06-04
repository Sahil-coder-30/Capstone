import express from 'express';
import morgan from 'morgan';

const app = express();
app.use(morgan('dev'));


app.get("/api/sandbox/helth" , (req , res) => {
    res.status(200).json({        
        status : "ok",
        message : "Sandbox API is working fine"
    })
})

export default app;
