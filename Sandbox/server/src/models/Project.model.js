import mongoose from "mongoose";

const projectSchema = new mongoose.Schema({
    user:{
        type: String,
        required: true
    },
    title:{
        type: String,
        required: true
    },
    sandboxId:{
        type: String,
        required: true,
    },
    status:{
        type: String,
        enum: ["live" , "down" , "not_started" , "building"],
        default: "not_started"
    },
    deletionStatus:{
        type: String,
        enum: ["active", "trash", "deleted"],
        default: "active",
        index: true
    },
    deletedAt:{
        type: Date,
        default: null
    }
}, {timestamps : true});


const Project = mongoose.model("Project" , projectSchema);
export default Project;