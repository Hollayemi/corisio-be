import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface ISubCategory extends Document {
    label: string;
    category: Types.ObjectId,
    icon?: string;
    isActive?: boolean;
    order?: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface ISubCategoryModel extends Model<ISubCategory> {
    findActiveCategories(): Promise<ISubCategory[]>;
    findByName(name: string): Promise<ISubCategory | null>;
    findByPartialName(searchTerm: string): Promise<ISubCategory[]>;
    getCategoriesWithProductCount(): Promise<Array<{
        subcategory: ISubCategory;
        productCount: number;
    }>>;
}

const SubCategorySchema: Schema<ISubCategory> = new Schema(
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
        icon: {
            type: String,
            required: false,
            trim: true,
            validate: {
                validator: function (value: string): boolean {
                    // You can adjust this validation based on your icon system
                    // This could be a URL, font-awesome class, or custom icon name
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
SubCategorySchema.index({ label: 1 }, { unique: true });
SubCategorySchema.index({ order: 1, label: 1 });
SubCategorySchema.index({ isActive: 1, order: 1 });
SubCategorySchema.index({ label: 'text' }, {
    name: 'subcategory_text_search',
    weights: { label: 10 }
});

// Static Methods
SubCategorySchema.statics.findActiveCategories = function (): Promise<ISubCategory[]> {
    return this.find({ isActive: true })
        .sort({ order: 1, label: 1 })
        .exec();
};

SubCategorySchema.statics.findByName = function (label: string): Promise<ISubCategory | null> {
    return this.findOne({
        label: { $regex: new RegExp(`^${label}$`, 'i') }
    }).exec();
};

SubCategorySchema.statics.findByPartialName = function (searchTerm: string): Promise<ISubCategory[]> {
    return this.find({
        label: { $regex: searchTerm, $options: 'i' },
        isActive: true
    })
        .sort({ order: 1, label: 1 })
        .exec();
};

SubCategorySchema.statics.getCategoriesWithProductCount = async function (): Promise<Array<{
    category: ISubCategory;
    productCount: number;
}>> {
    const categories = await this.find({ isActive: true })
        .sort({ order: 1, label: 1 })
        .exec();

    // Note: This assumes you have a Product model with a 'category' field
    const Product = mongoose.model('Product');

    const categoriesWithCounts = await Promise.all(
        categories.map(async (category: ISubCategory) => {
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
SubCategorySchema.virtual('displayName').get(function (this: ISubCategory) {
    return this.label.charAt(0).toUpperCase() + this.label.slice(1);
});

SubCategorySchema.virtual('productCount', {
    ref: 'Product',
    localField: '_id',
    foreignField: 'category',
    count: true
});

// Pre-save middleware
SubCategorySchema.pre<ISubCategory>('save', function (next) {
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

SubCategorySchema.pre<ISubCategory>('deleteOne', async function (next:any) {
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

SubCategorySchema.post<ISubCategory>('save', function (doc) {
    console.log(`Subcategory "${doc.label}" saved/updated`);
});

const Category: ISubCategoryModel = mongoose.model<ISubCategory, ISubCategoryModel>('default_subcategory', SubCategorySchema);

export default Category;