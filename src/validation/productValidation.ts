import Joi from 'joi';

// ─────────────────────────────────────────────────────────────────────────────
// Reusable primitives
// ─────────────────────────────────────────────────────────────────────────────
const objectId = Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .messages({ 'string.pattern.base': '{{#label}} must be a valid MongoDB ObjectId' });

// ─────────────────────────────────────────────────────────────────────────────
// Product — CREATE
// Field names match the Product model and user's existing config models
// ─────────────────────────────────────────────────────────────────────────────
export const createProductSchema = Joi.object({
    label: Joi.string().trim().min(2).max(200).required().messages({
        'string.base': 'Product name must be a string',
        'string.min': 'Product name must be at least 2 characters',
        'any.required': 'Product name is required',
    }),

    description: Joi.string().trim().allow('').max(1000).messages({
        'string.base': 'Description must be a string',
        'string.max': 'Description cannot exceed 1000 characters',
    }),

    price: Joi.number().min(0).required().messages({
        'number.base': 'Price must be a number',
        'number.min': 'Price cannot be negative',
        'any.required': 'Price is required',
    }),

    currency: Joi.string().length(3).uppercase().default('NGN'),

    availability: Joi.string()
        .valid('in_stock', 'out_of_stock', 'on_order')
        .default('in_stock')
        .messages({ 'any.only': 'availability must be in_stock, out_of_stock, or on_order' }),

    totalInStock: Joi.number().integer().min(0).default(1).messages({
        'number.base': 'Total in stock must be a number',
        'number.min': 'Total in stock cannot be negative',
    }),

    condition: Joi.string()
        .valid('new', 'used', 'refurbished')
        .default('new')
        .messages({ 'any.only': 'condition must be new, used, or refurbished' }),

    newImages: Joi.array()
        .items(Joi.string().uri().trim())
        .min(1)
        .required()
        .messages({
            'array.base': 'Images must be an array',
            'array.min': 'At least one image is required',
            'any.required': 'Images are required',
        }),

    video: Joi.string().uri().allow('', null).messages({
        'string.uri': 'Video must be a valid URL',
    }),

    // Relationship IDs — field names match the Product schema exactly
    category: objectId.required().messages({
        'any.required': 'Category is required',
    }),

    subcategory: objectId.required().messages({
        'any.required': 'Subcategory is required',
    }),

    productGroup: objectId.allow('', null),

    specifications: Joi.object().default({}).messages({
        'object.base': 'Specifications must be an object',
    }),

    tags: Joi.array()
        .items(Joi.string().trim().lowercase().max(40))
        .max(10)
        .default([])
        .messages({ 'array.max': 'Maximum 10 tags allowed' }),

    order: Joi.number().integer().min(0).default(0),
});

// ─────────────────────────────────────────────────────────────────────────────
// Product — UPDATE (all fields optional)
// ─────────────────────────────────────────────────────────────────────────────
export const updateProductSchema = Joi.object({
    label:         Joi.string().trim().min(2).max(200),
    description:   Joi.string().trim().allow('').max(1000),
    price:         Joi.number().min(0),
    currency:      Joi.string().length(3).uppercase(),
    availability:  Joi.string().valid('in_stock', 'out_of_stock', 'on_order'),
    totalInStock:  Joi.number().integer().min(0),
    condition:     Joi.string().valid('new', 'used', 'refurbished'),
    images:        Joi.array().items(Joi.string().uri().trim()).min(1),
    video:         Joi.string().uri().allow('', null),
    category:      objectId,
    sub_category:  objectId,
    product_group: objectId.allow('', null),
    specifications: Joi.object(),
    tags:          Joi.array().items(Joi.string().trim().lowercase().max(40)).max(10),
    isActive:      Joi.boolean(),
    order:         Joi.number().integer().min(0),
});

// ─────────────────────────────────────────────────────────────────────────────
// Product search query params
// ─────────────────────────────────────────────────────────────────────────────
export const productSearchSchema = Joi.object({
    query:         Joi.string().trim().max(100).allow(''),
    category:      objectId,
    sub_category:  objectId,
    product_group: objectId,
    condition:     Joi.string().valid('new', 'used', 'refurbished'),
    availability:  Joi.string().valid('in_stock', 'out_of_stock', 'on_order'),
    minPrice:      Joi.number().min(0),
    maxPrice:      Joi.number().min(0),
    tags:          Joi.string().trim(),   // comma-separated, parsed in controller
    lat:           Joi.number().min(-90).max(90),
    lng:           Joi.number().min(-180).max(180),
    radius:        Joi.number().min(0.1).max(50).default(5),
    page:          Joi.number().integer().min(1).default(1),
    limit:         Joi.number().integer().min(1).max(50).default(20),
    sortBy:        Joi.string().valid('relevance', 'price_asc', 'price_desc', 'newest', 'distance').default('relevance'),
});

// ─────────────────────────────────────────────────────────────────────────────
// Validation helper — returns sanitised value or error string
// ─────────────────────────────────────────────────────────────────────────────
export function validate<T>(
    schema: Joi.ObjectSchema<T>,
    data: unknown
): { value: T; error?: string } {
    const { error, value } = schema.validate(data, {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
    });

    if (error) {
        const message = error.details.map((d: any) => d.message).join('; ');
        return { value: value as T, error: message };
    }

    return { value: value as T };
}
