import mongoose from 'mongoose';

export const CREDIT_COMPANIES = ['mistral', 'google', 'cohere', 'openai', 'anthropic', 'unknown'];
export const SUBSCRIPTION_TIERS = ['free', 'pro', 'max'];
export const AGENT_TYPES = ['codingAgent', 'copilot', 'appAgent', 'title', 'unknown'];

const ProviderCreditSchema = new mongoose.Schema({
    company: {
        type: String,
        enum: CREDIT_COMPANIES,
        required: true
    },
    creditsGranted: {
        type: Number,
        default: 20,
        min: 0
    },
    creditsRemaining: {
        type: Number,
        default: 20,
        min: 0
    },
    promptTokens: {
        type: Number,
        default: 0,
        min: 0
    },
    completionTokens: {
        type: Number,
        default: 0,
        min: 0
    },
    totalTokens: {
        type: Number,
        default: 0,
        min: 0
    },
    billableTokens: {
        type: Number,
        default: 0,
        min: 0
    },
    billableCents: {
        type: Number,
        default: 0,
        min: 0
    },
    requestCount: {
        type: Number,
        default: 0,
        min: 0
    },
    lastUsedAt: {
        type: Date
    }
}, { _id: false });

const UsageEventSchema = new mongoose.Schema({
    company: {
        type: String,
        enum: CREDIT_COMPANIES,
        required: true
    },
    modelId: {
        type: String,
        default: ''
    },
    agentType: {
        type: String,
        enum: AGENT_TYPES,
        default: 'unknown'
    },
    projectId: {
        type: String,
        default: ''
    },
    requestId: {
        type: String,
        default: ''
    },
    subscription: {
        type: String,
        enum: SUBSCRIPTION_TIERS,
        default: 'free'
    },
    promptTokens: {
        type: Number,
        default: 0,
        min: 0
    },
    completionTokens: {
        type: Number,
        default: 0,
        min: 0
    },
    totalTokens: {
        type: Number,
        default: 0,
        min: 0
    },
    creditsDeducted: {
        type: Number,
        default: 0,
        min: 0
    },
    billableCents: {
        type: Number,
        default: 0,
        min: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, { _id: false });

const BillingSchema = new mongoose.Schema({
    currency: {
        type: String,
        default: 'USD'
    },
    currentPeriodStart: {
        type: Date,
        default: () => new Date()
    },
    currentPeriodEnd: {
        type: Date,
        default: () => {
            const date = new Date();
            date.setMonth(date.getMonth() + 1);
            return date;
        }
    },
    unbilledCents: {
        type: Number,
        default: 0,
        min: 0
    },
    lifetimeCents: {
        type: Number,
        default: 0,
        min: 0
    }
}, { _id: false });

const buildDefaultProviderCredits = () => CREDIT_COMPANIES
    .filter((company) => company !== 'unknown')
    .map((company) => ({
        company,
        creditsGranted: 20,
        creditsRemaining: 20
    }));

const CreditSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        unique: true,
        index: true
    },
    accountId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true
    },
    subscription: {
        type: String,
        enum: SUBSCRIPTION_TIERS,
        default: 'free',
        index: true
    },

    providerCredits: {
        type: [ProviderCreditSchema],
        default: buildDefaultProviderCredits
    },
    promptTokens: {
        type: Number,
        default: 0,
        min: 0
    },
    completionTokens: {
        type: Number,
        default: 0,
        min: 0
    },
    totalTokens: {
        type: Number,
        default: 0,
        min: 0
    },
    billing: {
        type: BillingSchema,
        default: () => ({})
    },
    usageEvents: {
        type: [UsageEventSchema],
        default: []
    }
}, { timestamps: true });

CreditSchema.methods.ensureProviderBucket = function ensureProviderBucket(company) {
    const normalizedCompany = CREDIT_COMPANIES.includes(company) ? company : 'unknown';
    let bucket = this.providerCredits.find((entry) => entry.company === normalizedCompany);

    if (!bucket) {
        bucket = {
            company: normalizedCompany,
            creditsGranted: normalizedCompany === 'unknown' ? 0 : 20,
            creditsRemaining: normalizedCompany === 'unknown' ? 0 : 20,
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            billableTokens: 0,
            billableCents: 0,
            requestCount: 0
        };
        this.providerCredits.push(bucket);
        bucket = this.providerCredits[this.providerCredits.length - 1];
    }

    return bucket;
};

CreditSchema.methods.trimUsageEvents = function trimUsageEvents(limit = 500) {
    if (this.usageEvents.length > limit) {
        this.usageEvents = this.usageEvents.slice(this.usageEvents.length - limit);
    }
};

const Credit = mongoose.model('credit', CreditSchema);
export default Credit;
