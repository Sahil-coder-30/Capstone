import mongoose from 'mongoose';

const ProfileSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
        required: true,
        unique: true
    },
    linkedin: {
        type: String,
        trim: true,
        default: ''
    },
    github: {
        type: String,
        trim: true,
        default: ''
    },
    twitter: {
        type: String,
        trim: true,
        default: ''
    },
    website: {
        type: String,
        trim: true,
        default: ''
    },
    bio: {
        type: String,
        trim: true,
        default: 'Full Stack Software Engineer building with CodeSpace.'
    },
    location: {
        type: String,
        trim: true,
        default: ''
    },
    company: {
        type: String,
        trim: true,
        default: ''
    },
    jobTitle: {
        type: String,
        trim: true,
        default: ''
    },
    skills: {
        type: [String],
        default: []
    },
    experienceYears: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

const Profile = mongoose.model('profile', ProfileSchema);
export default Profile;
