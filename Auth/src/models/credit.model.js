import mongoose from 'mongoose';

const CreditSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
        required: true,
        unique: true
    },
    credits: {
        type: Number,
        default: 20
    },
    promptTokens: {
        type: Number,
        default: 0
    },
    completionTokens: {
        type: Number,
        default: 0
    },
    totalTokens: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

const Credit = mongoose.model('credit', CreditSchema);
export default Credit;
