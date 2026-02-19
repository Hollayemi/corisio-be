import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IActivityLog extends Document {
    userId: Types.ObjectId;
    userName: string;
    action: string;
    description: string;
    metadata?: any;
    timestamp: Date;
    ipAddress?: string;
}

const ActivityLogSchema = new Schema<IActivityLog>({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'Staff',
        required: true,
        index: true
    },
    userName: {
        type: String,
        required: true
    },
    action: {
        type: String,
        required: true,
        index: true
    },
    description: {
        type: String,
        required: true
    },
    metadata: {
        type: Schema.Types.Mixed
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    },
    ipAddress: {
        type: String
    }
}, {
    timestamps: false
});

// Indexes for efficient querying
ActivityLogSchema.index({ userId: 1, timestamp: -1 });
ActivityLogSchema.index({ action: 1, timestamp: -1 });
ActivityLogSchema.index({ timestamp: -1 });

export default mongoose.model<IActivityLog>('ActivityLog', ActivityLogSchema);