import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface ProductGroup extends Document {
    label: string;
    category: Types.ObjectId,
    sub_category: Types.ObjectId,
    spec: Types.ObjectId,
    icon?: string;
    isActive: boolean;
    order?: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface ProductGroupModel extends Model<ProductGroup> {
    findActiveCategories(): Promise<ProductGroup[]>;
    findByName(name: string): Promise<ProductGroup | null>;
    findByPartialName(searchTerm: string): Promise<ProductGroup[]>;
    getCategoriesWithProductCount(): Promise<Array<{
        subcategory: ProductGroup;
        productCount: number;
    }>>;
}

const productGroup: Schema<ProductGroup> = new Schema(
    {
        label: {
            type: String,
            required: [true, 'Sub Category name is required'],
            unique: true,
            trim: true,
            minlength: [2, 'Sub Category name must be at least 2 characters long'],
            maxlength: [100, 'Sub Category name cannot exceed 100 characters']
        },
        category: { type: Schema.Types.ObjectId, ref: 'category' },
        sub_category: { type: Schema.Types.ObjectId, ref: 'Subcategory' },
        spec: { type: mongoose.SchemaTypes.ObjectId, ref: "default_spec" },
        icon: {
            type: String,
            required: false,
            trim: true,
            validate: {
                validator: function (value: string): boolean {
                    return !!(value && value.length > 0);
                },
                message: 'Icon cannot be empty'
            }
        },
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
productGroup.index({ label: 1 }, { unique: true });
productGroup.index({ order: 1, label: 1 });
productGroup.index({ isActive: 1, order: 1 });
productGroup.index({ label: 'text' }, {
    name: 'subcategory_text_search',
    weights: { label: 10 }
});

// Static Methods
productGroup.statics.findActiveCategories = function (): Promise<ProductGroup[]> {
    return this.find({ isActive: true })
        .sort({ order: 1, label: 1 })
        .exec();
};

productGroup.statics.findByName = function (label: string): Promise<ProductGroup | null> {
    return this.findOne({
        label: { $regex: new RegExp(`^${label}$`, 'i') }
    }).exec();
};

productGroup.statics.findByPartialName = function (searchTerm: string): Promise<ProductGroup[]> {
    return this.find({
        label: { $regex: searchTerm, $options: 'i' },
        isActive: true
    })
        .sort({ order: 1, label: 1 })
        .exec();
};

productGroup.statics.getCategoriesWithProductCount = async function (): Promise<Array<{
    category: ProductGroup;
    productCount: number;
}>> {
    const categories = await this.find({ isActive: true })
        .sort({ order: 1, label: 1 })
        .exec();

    // Note: This assumes you have a Product model with a 'category' field
    const Product = mongoose.model('Product');

    const categoriesWithCounts = await Promise.all(
        categories.map(async (category: ProductGroup) => {
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
productGroup.virtual('displayName').get(function (this: ProductGroup) {
    return this.label.charAt(0).toUpperCase() + this.label.slice(1);
});

productGroup.virtual('productCount', {
    ref: 'Product',
    localField: '_id',
    foreignField: 'category',
    count: true
});

// Pre-save middleware
productGroup.pre<ProductGroup>('save', function (next) {
    // Trim whitespace
    this.label = this.label.trim();
    if (this.icon) {
        this.icon = this.icon.trim();
    }

    // Ensure label is properly capitalized (first letter of each word)
    this.label = this.label.toLowerCase().split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

    next();
});

productGroup.pre<ProductGroup>('deleteOne', async function (next:any) {
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

productGroup.post<ProductGroup>('save', function (doc) {
    console.log(`Corisio_Group "${doc.label}" saved/updated`);
});

const Corisio_Group: ProductGroupModel = mongoose.model<ProductGroup, ProductGroupModel>('default_group', productGroup);

export default Corisio_Group;
