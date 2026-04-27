import mongoose, { Document, Schema, Types } from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────────
// Event types tracked by the engagement engine
// Adding a new event type = add field here + add to eventFieldMap in service
// ─────────────────────────────────────────────────────────────────────────────
export type EngagementEventType =
    | 'profileView'
    | 'listingClick'
    | 'callClick'
    | 'directionClick';

export const ENGAGEMENT_EVENT_TYPES: EngagementEventType[] = [
    'profileView',
    'listingClick',
    'callClick',
    'directionClick',
];

// ─────────────────────────────────────────────────────────────────────────────
// Interface
// ─────────────────────────────────────────────────────────────────────────────
export interface IStoreEngagement extends Document {
    storeId: Types.ObjectId;
    date: string;           // 'YYYY-MM-DD' UTC — one document per store per day

    profileViews: number;   // user explicitly opened the store's profile card
    listingClicks: number;  // user tapped a store in the search/discovery listing
    callClicks: number;     // user tapped the call button on a store profile
    directionClicks: number; // user tapped the directions button on a store profile

    createdAt: Date;
    updatedAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────────────────────────────────────
const StoreEngagementSchema = new Schema<IStoreEngagement>(
    {
        storeId: {
            type: Schema.Types.ObjectId,
            ref: 'Store',
            required: true,
            index: true,
        },
        // Stored as a 'YYYY-MM-DD' UTC string for human readability and
        // easy range queries without timezone conversion complexity.
        // Unique per store per day enforced by compound index below.
        date: {
            type: String,
            required: true,
            match: [/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format'],
            index: true,
        },

        profileViews:    { type: Number, default: 0, min: 0 },
        listingClicks:   { type: Number, default: 0, min: 0 },
        callClicks:      { type: Number, default: 0, min: 0 },
        directionClicks: { type: Number, default: 0, min: 0 },
    },
    {
        timestamps: true,
        // Lean-friendly: no virtuals needed on this model
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// Indexes
// ─────────────────────────────────────────────────────────────────────────────

// Primary compound index: one document per store per day (enforces uniqueness +
// is the exact query used in every upsert and analytics range lookup)
StoreEngagementSchema.index(
    { storeId: 1, date: 1 },
    { unique: true, name: 'store_date_unique' }
);

// Date-only index for platform-wide reporting (e.g. total daily activity)
StoreEngagementSchema.index({ date: 1 });

export default mongoose.model<IStoreEngagement>(
    'StoreEngagement',
    StoreEngagementSchema
);
