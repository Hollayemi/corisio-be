import { Request, Response, NextFunction } from 'express';
import { AppError, asyncHandler, AppResponse } from '../../middleware/error';
import {
    createProduct,
    updateProduct,
    softDeleteProduct,
    getStoreProducts,
    getProductById,
} from '../../services/productService';
import {
    createProductSchema,
    updateProductSchema,
    validate,
} from '../../validation/productValidation';

// ─────────────────────────────────────────────────────────────────────────────
// Extract storeId from JWT-attached store object
// ─────────────────────────────────────────────────────────────────────────────
function storeId(req: Request): string {
    return (req as any).store?._id?.toString() ?? (req as any).store?.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Create a product
// @route   POST /api/v1/stores/products
// @access  Store (verified only)
// ─────────────────────────────────────────────────────────────────────────────
export const createProductHandler = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const { value, error } = validate(createProductSchema, req.body);
        if (error) return next(new AppError(error, 400));

        let product;
        try {
            product = await createProduct(storeId(req), value as any);
        } catch (err: any) {
            return next(new AppError(err.message, err.statusCode ?? 400));
        }

        (res as AppResponse).data({ product }, 'Product created', 201);
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Update a product (owner only)
// @route   PUT /api/v1/stores/products/:id
// @access  Store (verified only)
// ─────────────────────────────────────────────────────────────────────────────
export const updateProductHandler = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const { value, error } = validate(updateProductSchema, req.body);
        if (error) return next(new AppError(error, 400));

        const product = await updateProduct(req.params.id, storeId(req), value as any);
        if (!product) return next(new AppError('Product not found', 404));

        (res as AppResponse).data({ product }, 'Product updated');
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Quick availability toggle (owner only)
//          Lightweight — avoids sending full product payload for a single field change
// @route   PATCH /api/v1/stores/products/:id/availability
// @access  Store (verified only)
// ─────────────────────────────────────────────────────────────────────────────
export const updateAvailability = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const { availability } = req.body;
        const valid = ['in_stock', 'out_of_stock', 'on_order'];

        if (!availability || !valid.includes(availability)) {
            return next(new AppError(`availability must be one of: ${valid.join(', ')}`, 400));
        }

        const product = await updateProduct(req.params.id, storeId(req), { availability } as any);
        if (!product) return next(new AppError('Product not found', 404));

        (res as AppResponse).data(
            { id: product.id, availability: product.availability, inStock: product.inStock },
            'Availability updated'
        );
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Soft-delete a product (owner only)
// @route   DELETE /api/v1/stores/products/:id
// @access  Store (verified only)
// ─────────────────────────────────────────────────────────────────────────────
export const deleteProductHandler = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const deleted = await softDeleteProduct(req.params.id, storeId(req));
        if (!deleted) return next(new AppError('Product not found', 404));

        (res as AppResponse).success('Product removed from listing');
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// @desc    List my store's products (owner view — all fields, includes inactive)
// @route   GET /api/v1/stores/products
// @access  Store
// ─────────────────────────────────────────────────────────────────────────────
export const getMyProducts = asyncHandler(
    async (req: Request, res: Response, _next: NextFunction) => {
        const { page, limit, category, subcategory, availability, search, isActive } = req.query;

        console.log('Query params:', { page, limit, category, subcategory, availability, search, isActive });

        const result = await getStoreProducts(storeId(req), {
            page: page ? parseInt(page as string, 10) : 1,
            limit: limit ? parseInt(limit as string, 10) : 20,
            category: category as string | undefined,
            subcategory: subcategory as string | undefined,
            availability: availability as string | undefined,
            search: search as string | undefined,
            isActive:
                isActive === 'true' ? true :
                    isActive === 'false' ? false : undefined,
        });

        (res as AppResponse).data(
            {
                products: result.products,
                pagination: {
                    total: result.total,
                    totalPages: result.totalPages,
                    page: page ? parseInt(page as string, 10) : 1,
                    limit: limit ? parseInt(limit as string, 10) : 20,
                },
            },
            'Products retrieved'
        );
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get single product — full detail (owner view)
// @route   GET /api/v1/stores/products/:id
// @access  Store
// ─────────────────────────────────────────────────────────────────────────────
export const getMyProductById = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const product = await getProductById(req.params.id, storeId(req));
        if (!product) return next(new AppError('Product not found', 404));

        (res as AppResponse).data({ product }, 'Product retrieved');
    }
);
