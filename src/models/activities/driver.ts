import mongoose, { Document, Schema, Types } from 'mongoose';

interface ILocation {
    lat: number;
    lng: number;
    address?: string;
}

export interface IDriverActivity extends Document {
    driverId: Types.ObjectId;
    driverName: string;
    action: string;
    description: string;
    metadata?: any;
    timestamp: Date;
    location?: ILocation;
    ipAddress?: string;
}

const DriverActivitySchema = new Schema<IDriverActivity>({
    driverId: {
        type: Schema.Types.ObjectId,
        ref: 'Driver',
        required: true,
        index: true
    },
    driverName: {
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
    location: {
        lat: { type: Number },
        lng: { type: Number },
        address: { type: String }
    },
    ipAddress: {
        type: String
    }
}, {
    timestamps: false
});

// Compound indexes for efficient querying
DriverActivitySchema.index({ driverId: 1, timestamp: -1 });
DriverActivitySchema.index({ action: 1, timestamp: -1 });
DriverActivitySchema.index({ timestamp: -1 });

export default mongoose.model<IDriverActivity>('DriverActivity', DriverActivitySchema);