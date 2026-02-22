import mongoose, { Document, Schema, Types } from 'mongoose';

type BoostLevel = 'none' | 'bronze' | 'silver' | 'gold';

export interface IBoostLedger extends Document {
    store: Types.ObjectId;
    event: 'activated' | 'upgraded' | 'expired' | 'revoked' | 'admin_grant';
    fromLevel: BoostLevel;
    toLevel: BoostLevel;
    triggerReferral?: Types.ObjectId;
    expiresAt: Date;
    note?: string;
    createdAt: Date;
}

const BoostLedgerSchema = new Schema<IBoostLedger>(
    {
        store: {
            type: Schema.Types.ObjectId,
            ref: 'Store',
            required: true,
            index: true
        },
        event: {
            type: String,
            enum: ['activated', 'upgraded', 'expired', 'revoked', 'admin_grant'],
            required: true
        },
        fromLevel: {
            type: String,
            enum: ['none', 'bronze', 'silver', 'gold'],
            required: true
        },
        toLevel: {
            type: String,
            enum: ['none', 'bronze', 'silver', 'gold'],
            required: true
        },
        triggerReferral: {
            type: Schema.Types.ObjectId,
            ref: 'Referral'
        },
        expiresAt: { type: Date, required: true },
        note: { type: String }
    },
    {
        timestamps: { createdAt: true, updatedAt: false }
    }
);

BoostLedgerSchema.index({ store: 1, createdAt: -1 });
BoostLedgerSchema.index({ event: 1, createdAt: -1 });

export default mongoose.model<IBoostLedger>('BoostLedger', BoostLedgerSchema);
