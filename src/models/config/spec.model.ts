import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface ISpec extends Document {
    label: string;
    spec: any;
    isActive: boolean;
    order?: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface ISpecModel extends Model<ISpec> {
    findActiveCategories(): Promise<ISpec[]>;
    findByName(name: string): Promise<ISpec | null>;
    findByPartialName(searchTerm: string): Promise<ISpec[]>;
    getCategoriesWithProductCount(): Promise<Array<{
        category: ISpec;
        productCount: number;
    }>>;
}

const CategorySchema: Schema<ISpec> = new Schema(
    {
        label: {
            type: String,
            required: [true, 'Category name is required'],
            unique: true,
            trim: true,
            minlength: [2, 'Category name must be at least 2 characters long'],
            maxlength: [100, 'Category name cannot exceed 100 characters']
        },
       spec: { type: Object, required: [true, "Spec Required"]  },
        isActive: {
            type: Boolean,
            default: true,
            index: true
        },
        order: {
            type: Number,
            default: 0,
            min: [0, 'Order cannot be negative']
        }
    },
    {
        timestamps: true,
        toJSON: {
            virtuals: true,
            transform: function (doc, ret: any) {
                ret.id = ret._id.toString();
                delete ret._id;
                delete ret.__v;
                return ret;
            }
        },
        toObject: { virtuals: true }
    }
);

// Indexes
CategorySchema.index({ label: 1 }, { unique: true });
CategorySchema.index({ order: 1, label: 1 });
CategorySchema.index({ isActive: 1, order: 1 });
CategorySchema.index({ label: 'text' }, {
    name: 'category_text_search',
    weights: { label: 10 }
});

// Static Methods
CategorySchema.statics.findActiveCategories = function (): Promise<ISpec[]> {
    return this.find({ isActive: true })
        .sort({ order: 1, label: 1 })
        .exec();
};

CategorySchema.statics.findByName = function (label: string): Promise<ISpec | null> {
    return this.findOne({
        label: { $regex: new RegExp(`^${label}$`, 'i') }
    }).exec();
};

CategorySchema.statics.findByPartialName = function (searchTerm: string): Promise<ISpec[]> {
    return this.find({
        label: { $regex: searchTerm, $options: 'i' },
        isActive: true
    })
        .sort({ order: 1, label: 1 })
        .exec();
};

CategorySchema.statics.getCategoriesWithProductCount = async function (): Promise<Array<{
    category: ISpec;
    productCount: number;
}>> {
    const categories = await this.find({ isActive: true })
        .sort({ order: 1, label: 1 })
        .exec();

    // Note: This assumes you have a Product model with a 'category' field
    const Product = mongoose.model('Product');

    const categoriesWithCounts = await Promise.all(
        categories.map(async (category: ISpec) => {
            const productCount = await Product.countDocuments({
                category: category._id,
                isActive: true
            });

            return {
                category,
                productCount
            };
        })
    );

    return categoriesWithCounts;
};

// Virtuals
CategorySchema.virtual('displayName').get(function (this: ISpec) {
    return this.label.charAt(0).toUpperCase() + this.label.slice(1);
});

CategorySchema.virtual('productCount', {
    ref: 'Product',
    localField: '_id',
    foreignField: 'category',
    count: true
});

// Pre-save middleware
CategorySchema.pre<ISpec>('save', function (next) {
    // Trim whitespace
    this.label = this.label.trim();

    // Ensure label is properly capitalized (first letter of each word)
    this.label = this.label.toLowerCase().split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

    next();
});

CategorySchema.pre<ISpec>('deleteOne', async function (next:any) {
    try {
        const Product = mongoose.model('Product');
        const productCount = await Product.countDocuments({ category: this?._id });

        if (productCount > 0) {
            throw new Error('Cannot delete category that has products. Deactivate it instead.');
        }

        next();
    } catch (error) {
        next(error as Error);
    }
});

CategorySchema.post<ISpec>('save', function (doc) {
    console.log(`spec "${doc.label}" saved/updated`);
});

const Category: ISpecModel = mongoose.model<ISpec, ISpecModel>('default_spec', CategorySchema);

export default Category;