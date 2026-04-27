import { Request, Response, NextFunction } from 'express';
import { AppError, asyncHandler, AppResponse } from '../../middleware/error';
import CorisioCategories, { ICategory } from '../../models/config/category.model';
import CorisioSubCategories, { ISubCategory } from '../../models/config/sub_categories';
import CorisioGroup, { ProductGroup } from '../../models/config/product_groups';
import CorisioSpecs, { ISpec } from '../../models/config/spec.model';
import StoreSchema, { CategoryType, IStore } from '../../models/stores/Store';
import { CorisioDefaultSpecs, CorisioCoreCategories } from './quickCategories';
import { generalCategoryThreadPipeline, storeCategoryThreadPipeline } from './pipeline';
import { CorisioArtisanCategories, CorisioArtisanSpecs } from './categories';


export const addCorisioCategories = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {

        const categories = CorisioArtisanCategories[0].children;

        for (let i = 0; i < categories.length; i++) {
            const cate = categories[i];

            const category = await CorisioCategories.findOneAndUpdate(
                { label: cate.label },
                { $setOnInsert: { label: cate.label, businessType: "services" } },
                { upsert: true, new: true }
            );

            for (let j = 0; j < cate.children.length; j++) {
                const sub_cate = cate.children[j];

                console.log({
                    label: sub_cate.label,
                    category: category.id,
                })

                const newSubCate = await CorisioSubCategories.findOneAndUpdate(
                    {
                        label: sub_cate.label,
                        category: category._id,
                    },
                    {
                        $setOnInsert: {
                            label: sub_cate.label,
                            category: category._id,
                        },
                    },
                    { upsert: true, new: true }
                );

                if (newSubCate)
                    for (let k = 0; k < sub_cate.children.length; k++) {
                        const group = sub_cate.children[k];
                        console.log({
                            label: group.label,
                            sub_category: newSubCate.id,
                            category: category.id,
                        })
                        const spec = group.children[0] && group.children?.[0]?.children?.[0]?.label;
                        const specId = await CorisioSpecs.findOne({ label: spec });

                        await CorisioGroup.findOneAndUpdate(
                            {
                                label: group.label,
                                sub_category: newSubCate._id,
                                category: category._id,
                            },
                            {
                                $setOnInsert: {
                                    label: group.label,
                                    sub_category: newSubCate._id,
                                    category: category._id,
                                    spec: specId && specId._id,
                                },
                            },
                            { upsert: true, new: true }
                        );
                    }
            }
        }
        (res as AppResponse).success('Categories added/updated successfully');
    }
);

export const addDefaultSpecs = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const spec = CorisioArtisanSpecs as Record<string, any>;
        for (const key in spec) {
            if (spec.hasOwnProperty(key)) {
                await CorisioSpecs.findOneAndUpdate(
                    {
                        label: key,
                    },
                    {
                        $setOnInsert: {
                            label: key,
                            spec: spec[key],
                        },
                    },
                    { upsert: true }
                );
            }
        }

        (res as AppResponse).success('Specs added/updated successfully');
    }
);



// now get the categories with their subcategories and groups to return as response
export const getCorisioCategories = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const { for_store, type = "services" } = req.query;
        const typeString = typeof type === 'string' ? type : 'services';
        let determinant;


        if (for_store && for_store === 'true') {
            if (!req.store) return next(new AppError('Store token provided is invalid', 401));
            const storeInfo = await StoreSchema.findById(req.store._id) as IStore;
            determinant = storeInfo.category;
        }

        let getCategories;
        if (!determinant) {
            getCategories = await CorisioCategories.aggregate(
                generalCategoryThreadPipeline(typeString)
            );
        } else {
            getCategories = await CorisioCategories.aggregate(
                storeCategoryThreadPipeline(determinant, typeString)
            );
        }

        (res as AppResponse).data(getCategories, 'Categories added/updated successfully', 200);
    });