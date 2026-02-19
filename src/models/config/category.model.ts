import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface ICategory extends Document {
    name: string;
    icon?: string;
    isActive: boolean;
    order?: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface ICategoryModel extends Model<ICategory> {
    findActiveCategories(): Promise<ICategory[]>;
    findByName(name: string): Promise<ICategory | null>;
    findByPartialName(searchTerm: string): Promise<ICategory[]>;
    getCategoriesWithProductCount(): Promise<Array<{
        category: ICategory;
        productCount: number;
    }>>;
}

const CategorySchema: Schema<ICategory> = new Schema(
    {
        name: {
            type: String,
            required: [true, 'Category name is required'],
            unique: true,
            trim: true,
            minlength: [2, 'Category name must be at least 2 characters long'],
            maxlength: [100, 'Category name cannot exceed 100 characters']
        },
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
CategorySchema.index({ name: 1 }, { unique: true });
CategorySchema.index({ order: 1, name: 1 });
CategorySchema.index({ isActive: 1, order: 1 });
CategorySchema.index({ name: 'text' }, {
    name: 'category_text_search',
    weights: { name: 10 }
});

// Static Methods
CategorySchema.statics.findActiveCategories = function (): Promise<ICategory[]> {
    return this.find({ isActive: true })
        .sort({ order: 1, name: 1 })
        .exec();
};

CategorySchema.statics.findByName = function (name: string): Promise<ICategory | null> {
    return this.findOne({
        name: { $regex: new RegExp(`^${name}$`, 'i') }
    }).exec();
};

CategorySchema.statics.findByPartialName = function (searchTerm: string): Promise<ICategory[]> {
    return this.find({
        name: { $regex: searchTerm, $options: 'i' },
        isActive: true
    })
        .sort({ order: 1, name: 1 })
        .exec();
};

CategorySchema.statics.getCategoriesWithProductCount = async function (): Promise<Array<{
    category: ICategory;
    productCount: number;
}>> {
    const categories = await this.find({ isActive: true })
        .sort({ order: 1, name: 1 })
        .exec();

    // Note: This assumes you have a Product model with a 'category' field
    const Product = mongoose.model('Product');

    const categoriesWithCounts = await Promise.all(
        categories.map(async (category: ICategory) => {
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
CategorySchema.virtual('displayName').get(function (this: ICategory) {
    return this.name.charAt(0).toUpperCase() + this.name.slice(1);
});

CategorySchema.virtual('productCount', {
    ref: 'Product',
    localField: '_id',
    foreignField: 'category',
    count: true
});

// Pre-save middleware
CategorySchema.pre<ICategory>('save', function (next) {
    // Trim whitespace
    this.name = this.name.trim();
    if (this.icon) {
        this.icon = this.icon.trim();
    }

    // Ensure name is properly capitalized (first letter of each word)
    this.name = this.name.toLowerCase().split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

    next();
});

CategorySchema.pre<ICategory>('deleteOne', async function (next:any) {
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

CategorySchema.post<ICategory>('save', function (doc) {
    console.log(`Category "${doc.name}" saved/updated`);
});

const Category: ICategoryModel = mongoose.model<ICategory, ICategoryModel>('Category', CategorySchema);

export default Category;