import mongoose, { Document, Schema, Types } from 'mongoose';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

interface FCMToken {
    token: string;
    deviceId: string;
    platform: 'ios' | 'android';
    addedAt: Date;
}

interface OpeningHour {
    day: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
    open: string;
    close: string;
    isClosed: boolean;
}

interface StoreBoost {
    level: 'none' | 'bronze' | 'silver' | 'gold';
    activatedAt?: Date;
    expiresAt?: Date;
    totalReferrals: number;
    source: 'referral' | 'admin_grant' | 'purchase';
}

interface CategoryType {
    main: [string],
    subCategories: [string],
    groups: [string],
}

export interface IStore extends Document {
    // Identity
    storeName: string;
    ownerName: string;
    phoneNumber: string;
    category: CategoryType;

    // Location
    address: {
        raw: string;
        lga: string;
        state: string;
        coordinates: {
            type: 'Point';
            coordinates: [number, number];
        };
    };

    // Optional profile
    photos: string[];
    openingHours: OpeningHour[];
    description?: string;
    website?: string;
    socialLinks?: { platform: string; url: string }[];

    // Auth
    otp?: string;
    otpExpiry?: Date;
    isPhoneVerified: boolean;
    refreshToken?: string;

    // Onboarding & Verification
    onboardingStatus: 'registered' | 'phone_verified' | 'profile_complete' | 'verification' | 'verified' | 'rejected' | 'suspended' ;
    profileCompletionScore: number;
    verifiedAt?: Date;
    verifiedBy?: Types.ObjectId;
    verificationMethod?: 'gps' | 'cac' | 'document_review' | 'agent_visit';
    verificationNotes?: string;
    rejectionReason?: string;

    // Referral
    referralCode: string;
    referredBy?: Types.ObjectId;
    referralValidated: boolean;
    referralValidatedAt?: Date;

    // Boost
    boost: StoreBoost;

    // Analytics
    profileViews: number;
    searchAppearances: number;
    clickThroughs: number;

    // Anti-abuse metadata
    registrationIp?: string;
    deviceFingerprint?: string;

    // Flags
    isActive: boolean;
    isFeatured: boolean;
    fcmTokens: FCMToken[];

    createdAt: Date;
    updatedAt: Date;

    // Methods
    getSignedJwtToken(): string;
    getRefreshToken(): string;
    generateOTP(): string;
    verifyOTP(otp: string): boolean;
}

const StoreSchema = new Schema<IStore>(
    {
        storeName: {
            type: String,
            required: [true, 'Store name is required'],
            trim: true,
            maxlength: [100, 'Store name cannot exceed 100 characters']
        },
        ownerName: {
            type: String,
            required: [true, 'Owner name is required'],
            trim: true,
            maxlength: [80, 'Owner name cannot exceed 80 characters']
        },
        phoneNumber: {
            type: String,
            required: [true, 'Phone number is required'],
            unique: true,
            trim: true,
            index: true,
            match: [/^[0-9+\-\s()]+$/, 'Please provide a valid phone number']
        },
        category: {
            main: {type: Array, required: [true, "You must select a category"]},
            subCategories: {type: Array, required: [false, ""]},
            groups: {type: Array, required: [false, ""]},
        },
        address: {
            raw: { type: String, required: [true, 'Address is required'], trim: true },
            lga: { type: String, required: [true, 'LGA is required'], trim: true },
            state: { type: String, required: [true, 'State is required'], trim: true, default: 'FCT' },
            coordinates: {
                type: { type: String, enum: ['Point'], default: 'Point' },
                coordinates: {
                    type: [Number],
                    required: [true, 'Coordinates are required'],
                    validate: {
                        validator: (v: number[]) => v.length === 2,
                        message: 'Coordinates must be [longitude, latitude]'
                    }
                }
            }
        },

        photos: [{ type: String }],
        openingHours: [
            {
                day: { type: String, enum: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
                open: { type: String },
                close: { type: String },
                isClosed: { type: Boolean, default: false }
            }
        ],
        description: { type: String, maxlength: [500, 'Description cannot exceed 500 characters'] },
        website: { type: String, trim: true },
        socialLinks: [{ platform: String, url: String }],

        otp: { type: String, select: false },
        otpExpiry: { type: Date, select: false },
        isPhoneVerified: { type: Boolean, default: false },
        refreshToken: { type: String, select: false },

        onboardingStatus: {
            type: String,
            enum: ['registered', 'phone_verified', 'profile_complete', 'verification', 'verified', 'rejected', 'suspended'],
            default: 'registered',
            index: true
        },
        profileCompletionScore: { type: Number, default: 0, min: 0, max: 100 },
        verifiedAt: { type: Date },
        verifiedBy: { type: Schema.Types.ObjectId, ref: 'Staff' },
        verificationMethod: { type: String, enum: ['gps', 'cac', 'document_review', 'agent_visit'] },
        verificationNotes: { type: String },
        rejectionReason: { type: String },

        referralCode: { type: String, unique: true, index: true },
        referredBy: { type: Schema.Types.ObjectId, ref: 'Store', default: null },
        referralValidated: { type: Boolean, default: false },
        referralValidatedAt: { type: Date },

        boost: {
            level: { type: String, enum: ['none', 'bronze', 'silver', 'gold'], default: 'none' },
            activatedAt: { type: Date },
            expiresAt: { type: Date },
            totalReferrals: { type: Number, default: 0 },
            source: { type: String, enum: ['referral', 'admin_grant', 'purchase'], default: 'referral' }
        },

        profileViews: { type: Number, default: 0 },
        searchAppearances: { type: Number, default: 0 },
        clickThroughs: { type: Number, default: 0 },

        registrationIp: { type: String, select: false },
        deviceFingerprint: { type: String, select: false },

        isActive: { type: Boolean, default: true, index: true },
        isFeatured: { type: Boolean, default: false },

        fcmTokens: [
            {
                token: { type: String, required: true },
                deviceId: { type: String, required: true },
                platform: { type: String, enum: ['ios', 'android'] },
                addedAt: { type: Date, default: Date.now }
            }
        ]
    },
    {
        timestamps: true,
        toJSON: {
            virtuals: true,
            transform: (_doc, ret) => {
                delete ret.otp;
                delete ret.otpExpiry;
                delete ret.refreshToken;
                delete ret.registrationIp;
                delete ret.deviceFingerprint;
                return ret;
            }
        },
        toObject: { virtuals: true }
    }
);

// Indexes
StoreSchema.index({ 'address.coordinates': '2dsphere' });
StoreSchema.index({ 'address.lga': 1, category: 1 });
StoreSchema.index({ 'boost.level': 1, 'boost.expiresAt': 1 });
StoreSchema.index({ onboardingStatus: 1, isActive: 1 });
StoreSchema.index({ referredBy: 1 });

// Compound index optimised for the public discovery query
// onboardingStatus + isActive are always present in the $geoNear base query
// createdAt supports 'newest' sortBy and recentDays filter
StoreSchema.index({ onboardingStatus: 1, isActive: 1, createdAt: -1 });

// Text index for search — storeName weighted 3x higher than description
// Supports case-insensitive full-text search in public store listing
StoreSchema.index(
    { storeName: 'text', description: 'text' },
    { weights: { storeName: 3, description: 1 }, name: 'store_text_search' }
);


// Pre-save: generate referral code
StoreSchema.pre('save', async function (next) {
    if (!this.referralCode) {
        this.referralCode = await generateUniqueReferralCode();
    }
    next();
});

// Methods
StoreSchema.methods.getSignedJwtToken = function (): string {
    return jwt.sign(
        { id: this._id.toString(), type: 'store' },
        process.env.JWT_STORE_SECRET as string,
        { expiresIn: '7d' }
    );
};

StoreSchema.methods.getRefreshToken = function (): string {
    const refreshToken = jwt.sign(
        { id: this._id.toString(), type: 'store' },
        process.env.JWT_STORE_REFRESH_SECRET as string,
        { expiresIn: '30d' }
    );
    this.refreshToken = refreshToken;
    return refreshToken;
};

StoreSchema.methods.generateOTP = function (): string {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    this.otp = crypto.createHash('sha256').update(otp).digest('hex');
    this.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    return otp;
};

StoreSchema.methods.verifyOTP = function (otp: string): boolean {
    if (!this.otp || !this.otpExpiry) return false;
    const hashed = crypto.createHash('sha256').update(otp).digest('hex');
    return hashed === this.otp && this.otpExpiry > new Date();
};

async function generateUniqueReferralCode(): Promise<string> {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const suffix = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const code = `STOR-${suffix}`;
    const existing = await mongoose.model('Store').findOne({ referralCode: code });
    return existing ? generateUniqueReferralCode() : code;
}

export default mongoose.model<IStore>('Store', StoreSchema);
