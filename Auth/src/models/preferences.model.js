import mongoose from 'mongoose';

const PreferencesSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
        required: true,
        unique: true
    },
    theme: {
        type: String,
        enum: ['dark', 'light', 'system'],
        default: 'dark'
    },
    editor: {
        fontSize: {
            type: String,
            default: '14px'
        },
        tabSize: {
            type: String,
            default: '2'
        },
        autoSave: {
            type: Boolean,
            default: true
        },
        minimap: {
            type: Boolean,
            default: true
        },
        wordWrap: {
            type: Boolean,
            default: true
        }
    },
    copilot: {
        modelPreference: {
            type: String,
            default: 'gemini-2.5-flash'
        },
        autoSuggest: {
            type: Boolean,
            default: true
        },
        interactiveMode: {
            type: String,
            enum: ['concise', 'detailed'],
            default: 'detailed'
        }
    },
    notifications: {
        emailLogins: {
            type: Boolean,
            default: true
        },
        securityAlerts: {
            type: Boolean,
            default: true
        }
    }
}, { timestamps: true });

const Preferences = mongoose.model('preferences', PreferencesSchema);
export default Preferences;
