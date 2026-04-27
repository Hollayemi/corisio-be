export const generalCategoryThreadPipeline = (type: string) => [
  {
    $match: {
      businessType: { $regex: new RegExp(`^${type}$`, 'i') },
      isActive: true,
    },
  },
  {
    $lookup: {
      from: 'default_subcategories',
      let: {
        category: '$_id',
      },
      pipeline: [
        {
          $lookup: {
            from: 'default_groups',
            let: {
              sub_category: '$_id',
              label: '$category',
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $eq: ['$sub_category', '$$sub_category'],
                  },
                },
              },
              {
                $project: {
                  label: 1,
                  spec: 1,
                },
              },
              {
                $lookup: {
                  from: 'default_specs',
                  localField: 'spec',
                  foreignField: '_id',
                  as: 'spec',
                },
              },
              {
                $set: {
                  spec: {
                    $arrayElemAt: ['$spec', 0],
                  },
                },
              },
            ],
            as: 'groups',
          },
        },
        {
          $match: {
            $expr: {
              $eq: ['$category', '$$category'],
            },
          },
        },
      ],
      as: 'sub_category',
    },
  },
  {
    $project: {
      category: '$label',
      sub_category: 1,
      group: 1,
    },
  },
];
interface determinantType {
  main: [],
  subCategories: [],
  groups: []
}


export const storeCategoryThreadPipeline = (determinant: any, type: string) => {
  // console.log('Extract IDs from determinant object');
  const categoryIds = determinant.main || [];
  const subCategoryIds = determinant.subCategories || [];
  const groupIds = determinant.groups || [];

  // console.log('Category IDs:', categoryIds);
  // console.log('Sub-category IDs:', subCategoryIds);
  // console.log('Group IDs:', groupIds);

  return [
    {
      $set: {
        c_id: {
          $toString: '$_id',
        },
      },
    },
    {
      $match: {
        businessType: { $regex: new RegExp(`^${type}$`, 'i') },
        c_id: {
          $in: categoryIds,
        },
      },
    },
    {
      $lookup: {
        from: 'default_subcategories',
        let: {
          category: '$_id',
          scategory: {
            $toString: '$_id',
          },
        },
        pipeline: [
          {
            $set: {
              s_id: {
                $toString: '$_id',
              },
            },
          },
          {
            $match: {
              $expr: {
                $and: [
                  {
                    $eq: ['$category', '$$category'],
                  },
                  {
                    $in: ['$s_id', subCategoryIds],
                  },
                ],
              },
            },
          },
          {
            $lookup: {
              from: 'default_groups',
              let: {
                sub_category: '$_id',
                ssub_category: {
                  $toString: '$_id',
                },
              },
              pipeline: [
                {
                  $set: {
                    g_id: {
                      $toString: '$_id',
                    },
                  },
                },
                {
                  $match: {
                    $expr: {
                      $and: [
                        {
                          $eq: ['$sub_category', '$$sub_category'],
                        },
                        {
                          $in: ['$g_id', groupIds],
                        },
                      ],
                    },
                  },
                },
                {
                  $project: {
                    label: 1,
                    spec: 1,
                  },
                },
                {
                  $lookup: {
                    from: 'default_specs',
                    localField: 'spec',
                    foreignField: '_id',
                    as: 'spec',
                  },
                },
                {
                  $set: {
                    spec: {
                      $arrayElemAt: ['$spec', 0],
                    },
                  },
                },
              ],
              as: 'groups',
            },
          },
        ],
        as: 'sub_category',
      },
    },
    {
      $project: {
        category: '$label',
        sub_category: 1,
      },
    },
  ];
};