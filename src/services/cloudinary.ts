import { v2 as cloudinary } from 'cloudinary';
import { Request } from 'express';
import multer from 'multer';
import { Readable } from 'stream';

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

interface UploadResult {
    url: string;
    publicId: string;
}

class CloudinaryService {
    // Upload a single image
    async uploadImage(file: Express.Multer.File, folder: string = 'go-kart'): Promise<UploadResult> {
        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: folder,
                    resource_type: 'image',
                    allowed_formats: ['jpg', 'png', 'jpeg', 'webp', 'gif'],
                    transformation: [
                        { width: 1000, height: 1000, crop: 'limit' },
                        { quality: 'auto:good' }
                    ]
                },
                (error, result) => {
                    if (error) {
                        reject(error);
                    } else if (result) {
                        resolve({
                            url: result.secure_url,
                            publicId: result.public_id
                        });
                    }
                }
            );

            const bufferStream = new Readable();
            bufferStream.push(file.buffer);
            bufferStream.push(null);
            bufferStream.pipe(uploadStream);
        });
    }

    // Upload multiple images
    async uploadMultipleImages(files: Express.Multer.File[], folder: string = 'go-kart'): Promise<string[]> {
        const uploadPromises = files.map(file => this.uploadImage(file, folder));
        const results = await Promise.all(uploadPromises);
        return results.map(result => result.url);
    }

    // Delete an image by URL
    async deleteImage(imageUrl: string): Promise<void> {
        try {
            // Extract public_id from Cloudinary URL
            const publicId = this.extractPublicId(imageUrl);
            if (publicId) {
                await cloudinary.uploader.destroy(publicId);
            }
        } catch (error) {
            console.error('Error deleting image from Cloudinary:', error);
            throw error;
        }
    }

    // Delete multiple images
    async deleteMultipleImages(imageUrls: string[]): Promise<void> {
        const deletePromises = imageUrls.map(url => this.deleteImage(url));
        await Promise.all(deletePromises);
    }

    // Extract public_id from Cloudinary URL
    private extractPublicId(url: string): string | null {
        try {
            const matches = url.match(/\/v\d+\/(.+)\./);
            return matches ? matches[1] : null;
        } catch (error) {
            return null;
        }
    }

    // Validate image file
    validateImageFile(file: Express.Multer.File): { valid: boolean; error?: string } {
        const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
        const maxSize = 5 * 1024 * 1024; // 5MB

        if (!allowedMimeTypes.includes(file.mimetype)) {
            return {
                valid: false,
                error: 'Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed.'
            };
        }

        if (file.size > maxSize) {
            return {
                valid: false,
                error: 'File size too large. Maximum size is 5MB.'
            };
        }

        return { valid: true };
    }

    // Validate multiple image files
    validateMultipleImageFiles(files: Express.Multer.File[]): { valid: boolean; error?: string } {
        for (const file of files) {
            const validation = this.validateImageFile(file);
            if (!validation.valid) {
                return validation;
            }
        }
        return { valid: true };
    }
}

// Multer configuration for memory storage
export const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
    },
    fileFilter: (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
        const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed.'));
        }
    }
});

export default new CloudinaryService();