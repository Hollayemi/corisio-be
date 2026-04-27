require('dotenv').config();
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;

// Validate environment variables
if (
  !process.env.CLOUDUNARY_NAME ||
  !process.env.CLOUDUNARY_API_KEY ||
  !process.env.CLOUDUNARY_SEC_KEY
) {
  throw new Error('Missing Cloudinary configuration in environment variables');
}

// Configure Cloudinary
try {
  cloudinary.config({
    cloud_name: process.env.CLOUDUNARY_NAME,
    api_key: process.env.CLOUDUNARY_API_KEY,
    api_secret: process.env.CLOUDUNARY_SEC_KEY,
  });

  // Test Cloudinary connection
  // cloudinary.api.ping((error, result) => {
  //   if (error) {
  //     console.error('Cloudinary connection error:');
  //     throw new Error(
  //       'Failed to connect to Cloudinary. Please check your configuration.'
  //     );
  //   } else {
  //     console.log('Cloudinary connection successful');
  //   }
  // });
} catch (error) {
  console.error('Cloudinary configuration error:', error);
  throw new Error('Cloudinary setup failed.');
}

// Create storage configurations
exports.storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'StudentForum',
    allowedFormats: ['jpg', 'png', 'jpeg', 'webm', 'mp4'],
    resource_type: 'auto',
    transformation: [
      {
        width: 300,
        height: 300,
        gravity: 'faces',
        crop: 'fill',
      },
    ],
  },
});

exports.storage2 = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'StudentForumPosts',
    allowedFormats: ['jpg', 'png', 'jpeg', 'webm', 'mp4'],
    resource_type: 'auto',
  },
});

module.exports = { cloudinary };
