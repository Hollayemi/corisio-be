import { Request, Response, NextFunction } from 'express';
import { AppError, asyncHandler, AppResponse } from '../../middleware/error';
import Product from '../../models/stores/Product';
import mongoose from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────────
// Note: Category, SubCategory, ProductGroup, and Spec models are in the user's
// config folder and are NOT imported here. Admins manage those directly through
// their existing config management system.
//
// This controller handles admin-level Product management only.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// @desc    List all products (admin — full data, all stores, filterable)
// @route   GET /api/v1/admin/products
// @access  Admin (manage_config)
// ─────────────────────────────────────────────────────────────────────────────
export const listAllProducts = asyncHandler(
    async (req: Request, res: Response, _next: NextFunction) => {
        const {
            storeId, category, sub_category, product_group,
            isActive, availability, condition, search,
            page = '1', limit = '20',
        } = req.query;

        const query: Record<string, unknown> = {};

        if (storeId && mongoose.Types.ObjectId.isValid(storeId as string)) {
            query.store = storeId;
        }
        if (category)      query.category      = category;
        if (sub_category)  query.sub_category   = sub_category;
        if (product_group) query.product_group  = product_group;
        if (isActive !== undefined) query.isActive = isActive === 'true';
        if (availability)  query.availability   = availability;
        if (condition)     query.condition      = condition;

        if (search && (search as string).trim()) {
            const escaped = (search as string).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            query.label = { $regex: escaped, $options: 'i' };
        }

        const p = Math.max(1, parseInt(page as string, 10));
        const l = Math.min(100, Math.max(1, parseInt(limit as string, 10)));

        const [total, products] = await Promise.all([
            Product.countDocuments(query),
            Product.find(query)
                .populate('store',        'storeName phoneNumber address.lga onboardingStatus isActive')
                .populate('category',     'label icon isActive')
                .populate('sub_category', 'label icon isActive')
                .populate('product_group','label icon isActive')
                .sort({ createdAt: -1 })
                .skip((p - 1) * l)
                .limit(l)
                .lean(),
        ]);

        (res as AppResponse).data(
            {
                products,
                pagination: {
                    total,
                    page: p,
                    limit: l,
                    totalPages: Math.ceil(total / l),
                },
            },
            'Products'
        );
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Toggle product isActive on/off
// @route   PATCH /api/v1/admin/products/:id/toggle-active
// @access  Admin (manage_config)
// ─────────────────────────────────────────────────────────────────────────────
export const toggleProductActive = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const product = await Product.findById(req.params.id);
        if (!product) return next(new AppError('Product not found', 404));

        product.isActive    = !product.isActive;
        product.lastUpdated = new Date();
        await product.save();

        (res as AppResponse).data(
            { id: product.id, label: product.label, isActive: product.isActive },
            `Product ${product.isActive ? 'activated' : 'deactivated'}`
        );
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get platform product statistics
// @route   GET /api/v1/admin/products/stats
// @access  Admin (manage_config)
// ─────────────────────────────────────────────────────────────────────────────
export const getProductStats = asyncHandler(
    async (_req: Request, res: Response, _next: NextFunction) => {
        const [total, active, inactive, inStock, outOfStock, onOrder, byCategoryRaw] =
            await Promise.all([
                Product.countDocuments(),
                Product.countDocuments({ isActive: true }),
                Product.countDocuments({ isActive: false }),
                Product.countDocuments({ isActive: true, availability: 'in_stock' }),
                Product.countDocuments({ isActive: true, availability: 'out_of_stock' }),
                Product.countDocuments({ isActive: true, availability: 'on_order' }),
                Product.aggregate([
                    { $match: { isActive: true } },
                    { $group: { _id: '$category', count: { $sum: 1 } } },
                    {
                        $lookup: {
                            from:         'categories',
                            localField:   '_id',
                            foreignField: '_id',
                            as:           'cat',
                        },
                    },
                    { $unwind: { path: '$cat', }}, // preserveNullAndEmpty: true } },
                    {
                        $project: {
                            _id:           0,
                            categoryId:    '$_id',
                            categoryLabel: '$cat.label',
                            count:         1,
                        },
                    },
                    { $sort: { count: -1 } },
                    { $limit: 20 },
                ]),
            ]);

        const byConditionRaw = await Product.aggregate([
            { $match: { isActive: true } },
            { $group: { _id: '$condition', count: { $sum: 1 } } },
        ]);

        const byCondition: Record<string, number> = {};
        byConditionRaw.forEach((r) => { byCondition[r._id] = r.count; });

        (res as AppResponse).data(
            {
                totals:      { total, active, inactive },
                availability: { inStock, outOfStock, onOrder },
                byCondition,
                topCategories: byCategoryRaw,
            },
            'Product statistics'
        );
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get full product detail (admin view — all fields including metrics)
// @route   GET /api/v1/admin/products/:id
// @access  Admin (manage_config)
// ─────────────────────────────────────────────────────────────────────────────
export const getProductDetail = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return next(new AppError('Invalid product ID', 400));
        }

        const product = await Product.findById(req.params.id)
            .populate('store',         'storeName phoneNumber address onboardingStatus isActive')
            .populate('category',      'label icon isActive order')
            .populate('sub_category',  'label icon isActive order')
            .populate({ path: 'product_group', select: 'label icon isActive spec', populate: { path: 'spec', select: 'label spec' } })
            .lean();

        if (!product) return next(new AppError('Product not found', 404));

        (res as AppResponse).data({ product }, 'Product detail');
    }
);
