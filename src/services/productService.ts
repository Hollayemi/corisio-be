import mongoose from 'mongoose';
import { PipelineStage } from 'mongoose';
import Product, { IProduct } from '../models/stores/Product';
import Store from '../models/stores/Store';
import { isBoostActive } from './rankingService';
const { cloudinary } = require('../utils/cloudinary');

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────
const MAX_PRODUCTS_PER_STORE = parseInt(
    process.env.MAX_PRODUCTS_PER_STORE ?? '50',
    10
);

// ─────────────────────────────────────────────────────────────────────────────
// Haversine distance (km) — products don't have coordinates; distance comes
// from the joined store document
// ─────────────────────────────────────────────────────────────────────────────
function haversineKm(
    [lng1, lat1]: [number, number],
    [lng2, lat2]: [number, number]
): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─────────────────────────────────────────────────────────────────────────────
// createProduct
// ─────────────────────────────────────────────────────────────────────────────
export async function createProduct(
    storeId: string,
    data: Partial<IProduct> & { newImages?: (string | { base64: string; video?: boolean })[] }
): Promise<IProduct> {
    // Enforce per-store product cap
    const currentCount = await Product.countDocuments({
        store: storeId,
        isActive: true,
    });

      
    
    
    
    if (currentCount >= MAX_PRODUCTS_PER_STORE) {
        throw Object.assign(
            new Error(`Store has reached the maximum of ${MAX_PRODUCTS_PER_STORE} active products`),
            { statusCode: 429 }
        );
    }
    const { newImages, ...others} = data
    
    if (!newImages || newImages.length === 0) {
        throw Object.assign(
            new Error('At least one image is required'),
            { statusCode: 400 }
        );
    }

    const uploadPromises = newImages.map(async (img, index) => {
        try {
          const folder = {
            folder: `corisio/store/${storeId}/${data.label}`.trim(),
            transformation: [
              { quality: 'auto:good' }
            ]
          };
    
          const uploadResponse = await cloudinary.uploader.upload(
            img,
            folder
          );
    
          console.log(uploadResponse.url)
    
          return { type: 'image', url: uploadResponse.url };
    
        } catch (error) {
          console.error(`Failed to upload image ${index}:`, error);
          throw Object.assign(
            new Error(`Image upload failed: ${error}`),
            { statusCode: 429 }
        );
        }
      });

    const results = await Promise.all(uploadPromises);

    const prodData = {
        ...others,
        images: results.map((r:any) => r.url),
        store: storeId,
    }

    console.log(prodData)

    const product = await Product.create(prodData);

    return product;
}

// ─────────────────────────────────────────────────────────────────────────────
// updateProduct — ownership-checked
// ─────────────────────────────────────────────────────────────────────────────
export async function updateProduct(
    productId: string,
    storeId: string,
    data: Partial<IProduct>
): Promise<IProduct | null> {
    if (!mongoose.Types.ObjectId.isValid(productId)) return null;

    const product = await Product.findOne({ _id: productId, store: storeId });
    if (!product) return null;

    // Sync inStock if availability changed
    if (data.availability !== undefined) {
        (data as any).inStock = data.availability === 'in_stock';
    }

    Object.assign(product, data);
    product.lastUpdated = new Date();
    await product.save();

    return product;
}

// ─────────────────────────────────────────────────────────────────────────────
// softDeleteProduct — isActive=false, preserves data for analytics
// ─────────────────────────────────────────────────────────────────────────────
export async function softDeleteProduct(
    productId: string,
    storeId: string
): Promise<boolean> {
    if (!mongoose.Types.ObjectId.isValid(productId)) return false;

    const result = await Product.findOneAndUpdate(
        { _id: productId, store: storeId },
        { isActive: false, lastUpdated: new Date() }
    );
    return result !== null;
}

// ─────────────────────────────────────────────────────────────────────────────
// getStoreProducts — owner view (all fields, includes inactive)
// ─────────────────────────────────────────────────────────────────────────────
export async function getStoreProducts(
    storeId: string,
    opts: {
        page?: number;
        limit?: number;
        category?: string;
        subcategory?: string;
        isActive?: boolean;
        availability?: string;
        search?: string;
    } = {}
): Promise<{ products: IProduct[]; total: number; totalPages: number }> {
    const page  = Math.max(1, opts.page ?? 1);
    const limit = Math.min(50, Math.max(1, opts.limit ?? 20));

    const query: Record<string, unknown> = { store: storeId };

    if (opts.isActive !== undefined)  query.isActive    = opts.isActive;
    if (opts.category)                query.category    = opts.category;
    if (opts.subcategory)            query.subcategory = opts.subcategory;
    if (opts.availability)            query.availability = opts.availability;

    if (opts.search?.trim()) {
        const escaped = opts.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        query.label = { $regex: escaped, $options: 'i' };
    }

    console.log('getStoreProducts query:', query, opts);

    const [total, products] = await Promise.all([
        Product.countDocuments(query),
        Product.find(query)
            .populate('category',     'label icon order')
            .populate('subcategory', 'label icon order')
            .populate({ path: 'productGroup', select: 'label icon spec', populate: { path: 'spec', select: 'label spec' } })
            .sort({ order: 1, createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit),
    ]);

    console.log('getStoreProducts query:', query, 'total:', total, 'returned:', products.length);

    return { products, total, totalPages: Math.ceil(total / limit) };
}

// ─────────────────────────────────────────────────────────────────────────────
// getProductById — with optional ownership check
// ─────────────────────────────────────────────────────────────────────────────
export async function getProductById(
    productId: string,
    ownedByStoreId?: string
): Promise<IProduct | null> {
    if (!mongoose.Types.ObjectId.isValid(productId)) return null;

    const query: Record<string, unknown> = { _id: productId };
    if (ownedByStoreId) query.store = ownedByStoreId;

    return Product.findOne(query)
        .populate('category',     'label icon')
        .populate('subcategory', 'label icon')
        .populate({ path: 'productGroup', select: 'label icon spec', populate: { path: 'spec', select: 'label spec' } })
        .populate('store', 'storeName address.lga address.state');
}

// ─────────────────────────────────────────────────────────────────────────────
// Public result shape — nothing internal
// ─────────────────────────────────────────────────────────────────────────────
export interface PublicProductResult {
    id: string;
    label: string;
    description: string | null;
    price: number;
    currency: string;
    images: string[];
    condition: string;
    availability: string;
    tags: string[];
    category:      { id: string; label: string; icon?: string } | null;
    subcategory:  { id: string; label: string; icon?: string } | null;
    product_group: { id: string; label: string } | null;
    createdAt: Date;
    store: {
        id: string;
        storeName: string;
        lga: string;
        state: string;
        coordinates: { lat: number; lng: number } | null;
        boostLevel:    string | null;
        boostExpiresAt: Date | null;
    };
    distanceKm: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// searchProducts — public geo-aware product discovery
//
// Pipeline:
//   1. $match active in-stock products + all filters
//   2. $lookup verified+active stores (join on store field)
//   3. $lookup category, subcategory, product_group labels
//   4. Application layer: haversine distance filter + sort + paginate
// ─────────────────────────────────────────────────────────────────────────────
export interface ProductSearchParams {
    query?:         string;
    category?:      string;
    subcategory?:  string;
    product_group?: string;
    condition?:     string;
    availability?:  string;
    minPrice?:      number;
    maxPrice?:      number;
    tags?:          string[];
    lat?:           number;
    lng?:           number;
    radiusKm?:      number;
    page:           number;
    limit:          number;
    sortBy: 'relevance' | 'price_asc' | 'price_desc' | 'newest' | 'distance';
}

export interface ProductSearchResult {
    products:   PublicProductResult[];
    total:      number;
    page:       number;
    limit:      number;
    totalPages: number;
    priceRange: { min: number; max: number } | null;
}

export async function searchProducts(
    params: ProductSearchParams
): Promise<ProductSearchResult> {
    const { page, limit } = params;

    // ── Build product match ───────────────────────────────────────────────
    const productMatch: Record<string, unknown> = {
        isActive: true,
        inStock:  true,
    };

    if (params.availability)  productMatch.availability = params.availability;
    if (params.condition)     productMatch.condition    = params.condition;

    if (params.category && mongoose.Types.ObjectId.isValid(params.category)) {
        productMatch.category = new mongoose.Types.ObjectId(params.category);
    }
    if (params.subcategory && mongoose.Types.ObjectId.isValid(params.subcategory)) {
        productMatch.subcategory = new mongoose.Types.ObjectId(params.subcategory);
    }
    if (params.product_group && mongoose.Types.ObjectId.isValid(params.product_group)) {
        productMatch.product_group = new mongoose.Types.ObjectId(params.product_group);
    }
    if (params.minPrice !== undefined || params.maxPrice !== undefined) {
        const pf: Record<string, number> = {};
        if (params.minPrice !== undefined) pf.$gte = params.minPrice;
        if (params.maxPrice !== undefined) pf.$lte = params.maxPrice;
        productMatch.price = pf;
    }
    if (params.tags && params.tags.length > 0) {
        productMatch.tags = { $in: params.tags };
    }
    if (params.query?.trim()) {
        const escaped = params.query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const rx = { $regex: escaped, $options: 'i' };
        productMatch.$or = [{ label: rx }, { description: rx }, { tags: rx }];
    }

    // ── Aggregation pipeline ──────────────────────────────────────────────
    // Collection names:
    //   'Category'    → 'categories'
    //   'Subcategory' → 'subcategories'
    //   'ProductGroup'→ 'productgroups'
    const pipeline: PipelineStage[] = [
        { $match: productMatch },

        // Join verified+active stores only
        {
            $lookup: {
                from: 'stores',
                let:  { storeId: '$store' },
                pipeline: [
                    {
                        $match: {
                            $expr: { $eq: ['$_id', '$$storeId'] },
                            onboardingStatus: 'verified',
                            isActive: true,
                        },
                    },
                    {
                        $project: {
                            storeName: 1,
                            'address.lga':         1,
                            'address.state':       1,
                            'address.coordinates': 1,
                            'boost.level':         1,
                            'boost.expiresAt':     1,
                        },
                    },
                ],
                as: 'storeData',
            },
        },
        // Drop products whose store is unverified or inactive
        { $match: { 'storeData.0': { $exists: true } } },
        { $unwind: '$storeData' },

        // Join category
        {
            $lookup: {
                from:         'categories',
                localField:   'category',
                foreignField: '_id',
                as:           'categoryData',
            },
        },
        { $unwind: { path: '$categoryData', preserveNullAndEmptyArrays: true } },

        // Join subcategory  (collection: 'subcategories')
        {
            $lookup: {
                from:         'subcategories',
                localField:   'subcategory',
                foreignField: '_id',
                as:           'subCategoryData',
            },
        },
        { $unwind: { path: '$subCategoryData', preserveNullAndEmptyArrays: true } },

        // Join product_group (collection: 'productgroups')
        {
            $lookup: {
                from:         'productgroups',
                localField:   'product_group',
                foreignField: '_id',
                as:           'productGroupData',
            },
        },
        { $unwind: { path: '$productGroupData', preserveNullAndEmptyArrays: true } },

        // Project only safe public fields
        {
            $project: {
                label:        1,
                description:  1,
                price:        1,
                currency:     1,
                images:       { $slice: ['$images', 3] },
                condition:    1,
                availability: 1,
                tags:         1,
                createdAt:    1,
                'categoryData._id':       1,
                'categoryData.label':     1,
                'categoryData.icon':      1,
                'subCategoryData._id':    1,
                'subCategoryData.label':  1,
                'subCategoryData.icon':   1,
                'productGroupData._id':   1,
                'productGroupData.label': 1,
                'storeData._id':                          1,
                'storeData.storeName':                    1,
                'storeData.address.lga':                  1,
                'storeData.address.state':                1,
                'storeData.address.coordinates':          1,
                'storeData.boost.level':                  1,
                'storeData.boost.expiresAt':              1,
            },
        },
    ];

    const raw = await Product.aggregate(pipeline);

    if (raw.length === 0) {
        return { products: [], total: 0, page, limit, totalPages: 0, priceRange: null };
    }

    // ── Distance filter + attachment ──────────────────────────────────────
    const hasGeo   = params.lat !== undefined && params.lng !== undefined;
    const userCoords: [number, number] | null = hasGeo ? [params.lng!, params.lat!] : null;
    const radiusKm = params.radiusKm ?? 5;

    let results = raw.map((item) => {
        let distanceKm: number | null = null;
        if (userCoords) {
            const storeCoords: [number, number] | undefined =
                item.storeData?.address?.coordinates?.coordinates;
            if (storeCoords?.length === 2) {
                distanceKm = parseFloat(haversineKm(userCoords, storeCoords).toFixed(2));
            }
        }
        return { ...item, distanceKm };
    });

    if (hasGeo) {
        results = results.filter(
            (r) => r.distanceKm === null || r.distanceKm <= radiusKm
        );
    }

    if (results.length === 0) {
        return { products: [], total: 0, page, limit, totalPages: 0, priceRange: null };
    }

    // ── Sort ──────────────────────────────────────────────────────────────
    if (params.sortBy === 'price_asc') {
        results.sort((a, b) => a.price - b.price);
    } else if (params.sortBy === 'price_desc') {
        results.sort((a, b) => b.price - a.price);
    } else if (params.sortBy === 'newest') {
        results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (params.sortBy === 'distance' && hasGeo) {
        results.sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));
    } else {
        // relevance: boosted stores first, then distance or recency
        results.sort((a, b) => {
            const aBoost = isBoostActive(a.storeData?.boost?.level, a.storeData?.boost?.expiresAt);
            const bBoost = isBoostActive(b.storeData?.boost?.level, b.storeData?.boost?.expiresAt);
            if (aBoost !== bBoost) return aBoost ? -1 : 1;
            if (hasGeo && a.distanceKm !== null && b.distanceKm !== null) return a.distanceKm - b.distanceKm;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
    }

    // ── Price range ───────────────────────────────────────────────────────
    const prices = results.map((r) => r.price);
    const priceRange = prices.length > 0
        ? { min: Math.min(...prices), max: Math.max(...prices) }
        : null;

    // ── Paginate ──────────────────────────────────────────────────────────
    const total      = results.length;
    const totalPages = Math.ceil(total / limit);
    const pageSlice  = results.slice((page - 1) * limit, page * limit);

    // ── Format public output ──────────────────────────────────────────────
    const products: PublicProductResult[] = pageSlice.map((item) => {
        const boostActive = isBoostActive(
            item.storeData?.boost?.level,
            item.storeData?.boost?.expiresAt
        );

        return {
            id:           item._id.toString(),
            label:        item.label,
            description:  item.description ?? null,
            price:        item.price,
            currency:     item.currency ?? 'NGN',
            images:       item.images ?? [],
            condition:    item.condition ?? 'new',
            availability: item.availability ?? 'in_stock',
            tags:         item.tags ?? [],
            category: item.categoryData
                ? { id: item.categoryData._id.toString(), label: item.categoryData.label, icon: item.categoryData.icon }
                : null,
            subcategory: item.subCategoryData
                ? { id: item.subCategoryData._id.toString(), label: item.subCategoryData.label, icon: item.subCategoryData.icon }
                : null,
            product_group: item.productGroupData
                ? { id: item.productGroupData._id.toString(), label: item.productGroupData.label }
                : null,
            createdAt: item.createdAt,
            store: {
                id:        item.storeData._id.toString(),
                storeName: item.storeData.storeName,
                lga:       item.storeData.address?.lga   ?? '',
                state:     item.storeData.address?.state ?? '',
                coordinates: item.storeData.address?.coordinates?.coordinates
                    ? { lat: item.storeData.address.coordinates.coordinates[1], lng: item.storeData.address.coordinates.coordinates[0] }
                    : null,
                boostLevel:    boostActive ? item.storeData.boost.level     : null,
                boostExpiresAt: boostActive ? item.storeData.boost.expiresAt : null,
            },
            distanceKm: item.distanceKm,
        };
    });

    // Fire-and-forget: increment searchAppearances
    const productIds = pageSlice.map((r) => r._id);
    if (productIds.length > 0) {
        Product.updateMany(
            { _id: { $in: productIds } },
            { $inc: { searchAppearances: 1 } }
        ).catch((err) => console.error('[products] searchAppearances increment failed:', err));
    }

    return { products, total, page, limit, totalPages, priceRange };
}

// ─────────────────────────────────────────────────────────────────────────────
// getPublicProductById — single product for public product page
// ─────────────────────────────────────────────────────────────────────────────
export async function getPublicProductById(
    productId: string
): Promise<PublicProductResult | null> {
    if (!mongoose.Types.ObjectId.isValid(productId)) return null;

    const pipeline: PipelineStage[] = [
        {
            $match: {
                _id:      new mongoose.Types.ObjectId(productId),
                isActive: true,
            },
        },
        {
            $lookup: {
                from: 'stores',
                let:  { storeId: '$store' },
                pipeline: [
                    {
                        $match: {
                            $expr: { $eq: ['$_id', '$$storeId'] },
                            onboardingStatus: 'verified',
                            isActive: true,
                        },
                    },
                    {
                        $project: {
                            storeName: 1,
                            'address.lga': 1, 'address.state': 1, 'address.coordinates': 1,
                            'boost.level': 1, 'boost.expiresAt': 1,
                        },
                    },
                ],
                as: 'storeData',
            },
        },
        { $match: { 'storeData.0': { $exists: true } } },
        { $unwind: '$storeData' },
        { $lookup: { from: 'categories',    localField: 'category',      foreignField: '_id', as: 'categoryData'     } },
        { $unwind: { path: '$categoryData',     preserveNullAndEmptyArrays: true } },
        { $lookup: { from: 'subcategories', localField: 'subcategory',  foreignField: '_id', as: 'subCategoryData'  } },
        { $unwind: { path: '$subCategoryData',  preserveNullAndEmptyArrays: true } },
        { $lookup: { from: 'productgroups', localField: 'product_group', foreignField: '_id', as: 'productGroupData' } },
        { $unwind: { path: '$productGroupData', preserveNullAndEmptyArrays: true } },
    ];

    const raw = await Product.aggregate(pipeline);
    if (!raw[0]) return null;

    // Fire-and-forget view count
    Product.findByIdAndUpdate(productId, { $inc: { viewCount: 1 } })
        .catch((err) => console.error('[products] viewCount increment failed:', err));

    const item       = raw[0];
    const boostActive = isBoostActive(item.storeData?.boost?.level, item.storeData?.boost?.expiresAt);

    return {
        id:           item._id.toString(),
        label:        item.label,
        description:  item.description ?? null,
        price:        item.price,
        currency:     item.currency ?? 'NGN',
        images:       item.images ?? [],
        condition:    item.condition ?? 'new',
        availability: item.availability ?? 'in_stock',
        tags:         item.tags ?? [],
        category:      item.categoryData    ? { id: item.categoryData._id.toString(),    label: item.categoryData.label,    icon: item.categoryData.icon    } : null,
        subcategory:  item.subCategoryData  ? { id: item.subCategoryData._id.toString(),  label: item.subCategoryData.label,  icon: item.subCategoryData.icon  } : null,
        product_group: item.productGroupData ? { id: item.productGroupData._id.toString(), label: item.productGroupData.label } : null,
        createdAt: item.createdAt,
        store: {
            id:        item.storeData._id.toString(),
            storeName: item.storeData.storeName,
            lga:       item.storeData.address?.lga   ?? '',
            state:     item.storeData.address?.state ?? '',
            coordinates: item.storeData.address?.coordinates?.coordinates
                ? { lat: item.storeData.address.coordinates.coordinates[1], lng: item.storeData.address.coordinates.coordinates[0] }
                : null,
            boostLevel:    boostActive ? item.storeData.boost.level     : null,
            boostExpiresAt: boostActive ? item.storeData.boost.expiresAt : null,
        },
        distanceKm: null,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// getStorePublicProducts — for "This store's products" on a public store profile
// ─────────────────────────────────────────────────────────────────────────────
export async function getStorePublicProducts(
    storeId:  string,
    opts: { page?: number; limit?: number; category?: string } = {}
): Promise<{ products: Partial<PublicProductResult>[]; total: number; totalPages: number }> {
    const page  = Math.max(1, opts.page ?? 1);
    const limit = Math.min(50, Math.max(1, opts.limit ?? 20));

    const store = await Store.findOne({
        _id: storeId,
        onboardingStatus: 'verified',
        isActive: true,
    })
        .select('storeName address.lga address.state boost')
        .lean();

    if (!store) return { products: [], total: 0, totalPages: 0 };

    const query: Record<string, unknown> = { store: storeId, isActive: true, inStock: true };
    if (opts.category) query.category = opts.category;

    const [total, rawProducts] = await Promise.all([
        Product.countDocuments(query),
        Product.find(query)
            .populate('category',     'label icon')
            .populate('subcategory', 'label icon')
            .select('label description price currency images condition availability tags category subcategory createdAt')
            .sort({ order: 1, createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
    ]);

    const boostActive = isBoostActive(store.boost?.level, store.boost?.expiresAt);

    const products = rawProducts.map((p: any) => ({
        id:           p._id.toString(),
        label:        p.label,
        description:  p.description ?? null,
        price:        p.price,
        currency:     p.currency ?? 'NGN',
        images:       (p.images ?? []).slice(0, 2),
        condition:    p.condition,
        availability: p.availability,
        tags:         p.tags ?? [],
        category:     p.category     ? { id: p.category._id.toString(),     label: p.category.label,     icon: p.category.icon     } : null,
        subcategory: p.subcategory ? { id: p.subcategory._id.toString(), label: p.subcategory.label, icon: p.subcategory.icon } : null,
        createdAt:    p.createdAt,
        store: {
            id:        (store as any)._id.toString(),
            storeName: store.storeName,
            lga:       store.address?.lga   ?? '',
            state:     store.address?.state ?? '',
            coordinates: null,
            boostLevel: boostActive ? store.boost.level : null,
            boostExpiresAt: boostActive ? store.boost.expiresAt ?? null : null,
        },
        distanceKm: null,
    }));

    return { products, total, totalPages: Math.ceil(total / limit) };
}
