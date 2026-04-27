import mongoose, { Document, Schema, Types } from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────────
// Supporting types
// ─────────────────────────────────────────────────────────────────────────────
export type ProductCondition   = 'new' | 'used' | 'refurbished';
export type AvailabilityStatus = 'in_stock' | 'out_of_stock' | 'on_order';

// ─────────────────────────────────────────────────────────────────────────────
// Interface
// Field naming mirrors the user's existing config models:
//   category     → ref 'Category'    (field: label)
//   subcategory → ref 'Subcategory' (field: label) — matches productGroup.subcategory
//   productGroup→ ref 'ProductGroup' (field: label, has spec ref to 'spec')
// ─────────────────────────────────────────────────────────────────────────────
export interface IProduct extends Document {
    label: string;                  // matches label convention across all config models
    description?: string;
    price: number;
    currency: string;               // default 'NGN'

    // Inventory
    inStock: boolean;
    availability: AvailabilityStatus;
    totalInStock: number;
    condition: ProductCondition;

    // Media
    images: string[];
    video?: string;

    // Relationships — ref strings match the user's model registrations exactly
    store: Types.ObjectId;           // ref 'Store'
    category: Types.ObjectId;        // ref 'Category'
    subcategory: Types.ObjectId;    // ref 'Subcategory'
    productGroup?: Types.ObjectId;  // ref 'ProductGroup'

    // Dynamic spec object — validated against the ProductGroup's linked spec template
    specifications: Record<string, unknown>;

    tags: string[];

    // Lifecycle
    isActive: boolean;
    lastUpdated: Date;
    order?: number;

    // Boost-ready (no active functionality, safe for future monetisation)
    boostLevel: number;
    boostExpiresAt?: Date;

    // Discovery metrics
    viewCount: number;
    searchAppearances: number;

    createdAt: Date;
    updatedAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────────────────────────────────────
const ProductSchema = new Schema<IProduct>(
    {
        label: {
            type: String,
            required: [true, 'Product name is required'],
            trim: true,
            minlength: [2, 'Product name must be at least 2 characters'],
            maxlength: [200, 'Product name cannot exceed 200 characters'],
        },
        description: {
            type: String,
            trim: true,
            maxlength: [1000, 'Description cannot exceed 1000 characters'],
        },
        price: {
            type: Number,
            required: [true, 'Price is required'],
            min: [0, 'Price cannot be negative'],
        },
        currency: {
            type: String,
            default: 'NGN',
            uppercase: true,
            maxlength: 3,
        },

        inStock:       { type: Boolean, default: true, index: true },
        availability:  { type: String, enum: ['in_stock', 'out_of_stock', 'on_order'], default: 'in_stock', index: true },
        totalInStock:  { type: Number, default: 1, min: [0, 'Cannot be negative'] },
        condition:     { type: String, enum: ['new', 'used', 'refurbished'], default: 'new', index: true },

        images: {
            type: [String],
            validate: {
                validator: (v: string[]) => v.length >= 1,
                message: 'At least one image is required',
            },
        },
        video: { type: String, trim: true },

        // ── Relationships ────────────────────────────────────────────────────
        store: {
            type: Schema.Types.ObjectId,
            ref: 'Store',
            required: [true, 'Store is required'],
            index: true,
        },
        category: {
            type: Schema.Types.ObjectId,
            ref: 'default_category',         // → category_model.ts: mongoose.model('Category', ...)
            required: [true, 'Category is required'],
            index: true,
        },
        subcategory: {
            type: Schema.Types.ObjectId,
            ref: 'default_subcategory',      // → sub_categories.ts: mongoose.model('Subcategory', ...)
            required: [true, 'Subcategory is required'],
            index: true,
        },
        productGroup: {
            type: Schema.Types.ObjectId,
            ref: 'default_group',     // → productGroups.ts (should be registered as 'ProductGroup')
            default: null,
        },

        specifications: {
            type: Schema.Types.Mixed,
            required: [true, 'Specifications are required'],
            default: {},
        },
        tags:      { type: [String], default: [], index: true },

        isActive:    { type: Boolean, default: true, index: true },
        lastUpdated: { type: Date, default: Date.now },
        order:       { type: Number, default: 0, min: 0 },

        boostLevel:     { type: Number, default: 0, min: 0, max: 3, index: true },
        boostExpiresAt: { type: Date, default: null },

        viewCount:         { type: Number, default: 0, min: 0 },
        searchAppearances: { type: Number, default: 0, min: 0 },
    },
    {
        timestamps: true,
        toJSON: {
            virtuals: true,
            transform: (_doc, ret: any) => {
                ret.id = ret._id?.toString();
                delete ret._id;
                delete ret.__v;
                return ret;
            },
        },
        toObject: { virtuals: true },
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// Indexes
// ─────────────────────────────────────────────────────────────────────────────
ProductSchema.index({ store: 1, isActive: 1 });
ProductSchema.index({ store: 1, label: 1 }, { unique: true, name: 'product_store_label_unique' });
ProductSchema.index({ category: 1, subcategory: 1, isActive: 1 });
ProductSchema.index({ subcategory: 1, isActive: 1, inStock: 1 });
ProductSchema.index({ productGroup: 1, isActive: 1 });
ProductSchema.index({ isActive: 1, inStock: 1, category: 1 });
ProductSchema.index({ boostLevel: -1, boostExpiresAt: 1 });
ProductSchema.index(
    { label: 'text', description: 'text', tags: 'text' },
    { weights: { label: 5, tags: 3, description: 1 }, name: 'product_text_search' }
);

// ─────────────────────────────────────────────────────────────────────────────
// Pre-save
// ─────────────────────────────────────────────────────────────────────────────
ProductSchema.pre('save', function (next) {
    // Sync inStock with availability
    this.inStock = this.availability === 'in_stock';

    // Capitalize label — same pattern as Category/SubCategory pre-save hooks
    this.label = this.label.trim().toLowerCase()
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');

    // Deduplicate + lowercase tags
    this.tags = [...new Set(this.tags.map((t) => t.toLowerCase().trim()))];

    this.lastUpdated = new Date();
    next();
});

export default mongoose.model<IProduct>('Product', ProductSchema);
