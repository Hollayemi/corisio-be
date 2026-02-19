import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface INigeriaStates extends Document {
    Abia: [string];
    Adamawa: [string];
    Anambra: [string];
    AkwaIbom: [string];
    Bauchi: [string];
    Bayelsa: [string];
    Benue: [string];
    Borno: [string];
    CrossRiver: [string];
    Delta: [string];
    Ebonyi: [string];
    Enugu: [string];
    Edo: [string];
    Ekiti: [string];
    FCT: [string];
    Gombe: [string];
    Imo: [string];    
    Jigawa: [string];
    Kaduna: [string];
    Kano: [string];
    Katsina: [string];
    Kebbi: [string];
    Kogi: [string];
    Kwara: [string];
    Lagos: [string];
    Nasarawa: [string];
    Niger: [string];
    Ogun: [string];   
    Ondo: [string];
    Osun: [string];
    Oyo: [string];
    Plateau: [string];
    Rivers: [string];
    Sokoto: [string];
    Taraba: [string];
    Yobe: [string];
    Zamfara: [string];
}

const NigeriaStatesSchema: Schema<INigeriaStates> = new Schema(
    {
        Abia: [String],
        Adamawa: [String],
        Anambra: [String],
        AkwaIbom: [String],
        Bauchi: [String],
        Bayelsa: [String],
        Benue: [String],
        Borno: [String],
        CrossRiver: [String],
        Delta: [String],
        Ebonyi: [String],
        Enugu: [String],
        Edo: [String],
        Ekiti: [String],
        FCT: [String],
        Gombe: [String],
        Imo: [String],    
        Jigawa: [String],
        Kaduna: [String],
        Kano: [String],
        Katsina: [String],
        Kebbi: [String],
        Kogi: [String],
        Kwara: [String],
        Lagos: [String],
        Nasarawa: [String],
        Niger: [String],
        Ogun: [String],   
        Ondo: [String],
        Osun: [String],
        Oyo: [String],
        Plateau: [String],
        Rivers: [String],
        Sokoto: [String],
        Taraba:[ String ],
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
NigeriaStatesSchema.index({ name: 1 }, { unique: true });
NigeriaStatesSchema.index({ order: 1, name: 1 });
NigeriaStatesSchema.index({ isActive: 1, order: 1 });
NigeriaStatesSchema.index({ name: 'text' }, {
    name: '',
    weights: { name: 10 }
});

// Static Methods
NigeriaStatesSchema.statics.findActiveCategories = function (): Promise<INigeriaStates[]> {
    return this.find({ isActive: true })
        .sort({ order: 1, name: 1 })
        .exec();
};

NigeriaStatesSchema.statics.findByName = function (name: string): Promise<INigeriaStates | null> {
    return this.findOne({
        name: { $regex: new RegExp(`^${name}$`, 'i') }
    }).exec();
};

NigeriaStatesSchema.statics.findByPartialName = function (searchTerm: string): Promise<INigeriaStates[]> {
    return this.find({
        name: { $regex: searchTerm, $options: 'i' },
        isActive: true
    })
        .sort({ order: 1, name: 1 })
        .exec();
};

NigeriaStatesSchema.statics.getCategoriesWithProductCount = async function (): Promise<Array<{
    category: INigeriaStates;
    productCount: number;
}>> {
    const categories = await this.find({ isActive: true })
        .sort({ order: 1, name: 1 })
        .exec();

    // Note: This assumes you have a Product model with a 'category' field
    const Product = mongoose.model('Product');

    const categoriesWithCounts = await Promise.all(
        categories.map(async (category: INigeriaStates) => {
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


NigeriaStatesSchema.pre<INigeriaStates>('deleteOne', async function (next:any) {
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


const NigeriaStates = mongoose.model<INigeriaStates>('nigeria_states', NigeriaStatesSchema);

export default NigeriaStates;