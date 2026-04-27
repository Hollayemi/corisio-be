import { Request, Response, NextFunction } from 'express';
import { AppError, asyncHandler, AppResponse } from '../../middleware/error';
import {
    searchProducts,
    getPublicProductById,
    getStorePublicProducts,
    ProductSearchParams,
} from '../../services/productService';
import { validate, productSearchSchema } from '../../validation/productValidation';
import mongoose from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Search products across all verified stores (geo-aware)
// @route   GET /api/v1/public/products/search
// @access  Public
//
// Query params:
//   query, category, sub_category, product_group,
//   condition, availability, minPrice, maxPrice,
//   tags (comma-separated), lat, lng, radius (km),
//   page, limit, sortBy
// ─────────────────────────────────────────────────────────────────────────────
export const searchPublicProducts = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const { value, error } = validate(productSearchSchema, req.query);
        if (error) return next(new AppError(error, 400));

        const typedValue = value as any;

        const tags = typedValue.tags
            ? (typedValue.tags as unknown as string)
                  .split(',')
                  .map((t: string) => t.trim().toLowerCase())
                  .filter(Boolean)
            : undefined;

        const params: ProductSearchParams = {
            query:         typedValue.query,
            category:      typedValue.category,
            subcategory:  typedValue.sub_category,
            product_group: typedValue.product_group,
            condition:     typedValue.condition     as any,
            availability:  typedValue.availability  as any,
            minPrice:      typedValue.minPrice,
            maxPrice:      typedValue.maxPrice,
            tags,
            lat:      typedValue.lat,
            lng:      typedValue.lng,
            radiusKm: typedValue.radius,
            page:     typedValue.page  ?? 1,
            limit:    typedValue.limit ?? 20,
            sortBy:   (typedValue.sortBy ?? 'relevance') as ProductSearchParams['sortBy'],
        };

        const result = await searchProducts(params);

        (res as AppResponse).data(
            {
                products: result.products,
                pagination: {
                    total:      result.total,
                    totalPages: result.totalPages,
                    page:       result.page,
                    limit:      result.limit,
                    hasNextPage: result.page < result.totalPages,
                    hasPrevPage: result.page > 1,
                },
                meta: {
                    priceRange: result.priceRange,
                    query:      params.query ?? null,
                    geo:        params.lat != null
                        ? { lat: params.lat, lng: params.lng, radiusKm: params.radiusKm }
                        : null,
                },
            },
            'Products retrieved'
        );
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get single product — public view with store context
// @route   GET /api/v1/public/products/:id
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
export const getPublicProduct = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const product = await getPublicProductById(req.params.id);
        if (!product) return next(new AppError('Product not found', 404));

        (res as AppResponse).data({ product }, 'Product retrieved');
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get products listed by a specific verified store
// @route   GET /api/v1/public/stores/:storeId/products
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
export const getStoreProductsPublic = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const { storeId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(storeId)) {
            return next(new AppError('Store not found', 404));
        }

        const { page, limit, category } = req.query;

        const result = await getStorePublicProducts(storeId, {
            page:     page     ? parseInt(page as string, 10)  : 1,
            limit:    limit    ? parseInt(limit as string, 10) : 20,
            category: category as string | undefined,
        });

        (res as AppResponse).data(
            {
                products: result.products,
                pagination: {
                    total:      result.total,
                    totalPages: result.totalPages,
                },
            },
            'Store products retrieved'
        );
    }
);
