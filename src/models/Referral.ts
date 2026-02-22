import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IReferral extends Document {
    referrer: Types.ObjectId;
    referred: Types.ObjectId;
    referralCode: string;
    channel: 'sms' | 'link' | 'phone_input' | 'qr_code';

    status: 'pending' | 'profile_complete' | 'validated' | 'rejected';

    milestones: {
        registeredAt?: Date;
        phoneVerifiedAt?: Date;
        profileCompletedAt?: Date;
        adminVerifiedAt?: Date;
        validatedAt?: Date;
    };

    boostApplied: boolean;
    boostAppliedAt?: Date;

    // Anti-abuse snapshots
    referredPhoneNumber: string;
    ipAtRegistration?: string;
    deviceFingerprintAtRegistration?: string;

    flagged: boolean;
    flagReason?: string;

    createdAt: Date;
    updatedAt: Date;
}

const ReferralSchema = new Schema<IReferral>(
    {
        referrer: {
            type: Schema.Types.ObjectId,
            ref: 'Store',
            required: true,
            index: true
        },
        referred: {
            type: Schema.Types.ObjectId,
            ref: 'Store',
            required: true,
            index: true
        },
        referralCode: {
            type: String,
            required: true,
            index: true
        },
        channel: {
            type: String,
            enum: ['sms', 'link', 'phone_input', 'qr_code'],
            default: 'link'
        },
        status: {
            type: String,
            enum: ['pending', 'profile_complete', 'validated', 'rejected'],
            default: 'pending',
            index: true
        },
        milestones: {
            registeredAt: { type: Date },
            phoneVerifiedAt: { type: Date },
            profileCompletedAt: { type: Date },
            adminVerifiedAt: { type: Date },
            validatedAt: { type: Date }
        },
        boostApplied: { type: Boolean, default: false },
        boostAppliedAt: { type: Date },

        referredPhoneNumber: { type: String, required: true },
        ipAtRegistration: { type: String, select: false },
        deviceFingerprintAtRegistration: { type: String, select: false },

        flagged: { type: Boolean, default: false, index: true },
        flagReason: { type: String }
    },
    {
        timestamps: true
    }
);

// Compound indexes
ReferralSchema.index({ referrer: 1, status: 1 });
ReferralSchema.index({ referred: 1, status: 1 });
ReferralSchema.index({ referralCode: 1, status: 1 });
ReferralSchema.index({ referredPhoneNumber: 1 });
ReferralSchema.index({ createdAt: -1 });

export default mongoose.model<IReferral>('Referral', ReferralSchema);
