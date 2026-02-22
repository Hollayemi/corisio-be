import { Request, Response, NextFunction } from 'express';
import Store, { IStore } from '../../models/Store';
import { AppError, asyncHandler, AppResponse } from '../../middleware/error';
import { calculateProfileScore } from '../../services/referralService';

// ─────────────────────────────────────────────
// Helper — send token response
// ─────────────────────────────────────────────
const sendTokenResponse = (
    store: IStore,
    statusCode: number,
    res: AppResponse,
    message: string
) => {
    const token = store.getSignedJwtToken();
    const refreshToken = store.getRefreshToken();
    store.save({ validateBeforeSave: false });

    const cookieOptions = {
        expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production'
    };

    res.status(statusCode)
        .cookie('storeToken', token, cookieOptions)
        .data(
            {
                store: {
                    id: store._id,
                    storeName: store.storeName,
                    ownerName: store.ownerName,
                    phoneNumber: store.phoneNumber,
                    onboardingStatus: store.onboardingStatus,
                    referralCode: store.referralCode,
                    boost: store.boost
                },
                token,
                refreshToken
            },
            message,
            statusCode
        );
};

// ─────────────────────────────────────────────
// @desc    Send OTP (register stub if new store)
// @route   POST /api/v1/stores/auth/send-otp
// @access  Public
// ─────────────────────────────────────────────
export const sendOTP = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const { phoneNumber } = req.body;

        if (!phoneNumber) {
            return next(new AppError('Phone number is required', 400));
        }

        let store = await Store.findOne({ phoneNumber }).select('+otp +otpExpiry');

        if (!store) {
            // Create minimal stub record
            store = await Store.create({
                phoneNumber,
                storeName: `Store_${phoneNumber.slice(-6)}`,
                ownerName: 'Pending',
                category: undefined,
                address: {
                    raw: 'Pending',
                    lga: 'Pending',
                    state: 'FCT',
                    coordinates: { type: 'Point', coordinates: [0, 0] }
                }
            });
        }

        const otp = store.generateOTP();
        await store.save({ validateBeforeSave: false });

        // TODO: send via Twilio SMS
        console.log(`[STORE OTP] ${phoneNumber}: ${otp}`);

        const responseData: Record<string, unknown> = {
            phoneNumber,
            message: 'OTP sent successfully'
        };

        if (process.env.NODE_ENV === 'development') {
            responseData.otp = otp;
        }

        (res as AppResponse).data(responseData, 'OTP sent');
    }
);

// ─────────────────────────────────────────────
// @desc    Verify OTP → issue JWT
// @route   POST /api/v1/stores/auth/verify-otp
// @access  Public
// ─────────────────────────────────────────────
export const verifyOTP = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const { phoneNumber, otp } = req.body;

        if (!phoneNumber || !otp) {
            return next(new AppError('Phone number and OTP are required', 400));
        }

        const store = await Store.findOne({ phoneNumber }).select('+otp +otpExpiry');

        if (!store) {
            return next(new AppError('Store not found', 404));
        }

        if (!store.verifyOTP(otp)) {
            return next(new AppError('Invalid or expired OTP', 401));
        }

        store.otp = undefined;
        store.otpExpiry = undefined;
        store.isPhoneVerified = true;

        if (store.onboardingStatus === 'registered') {
            store.onboardingStatus = 'phone_verified';
        }

        await store.save({ validateBeforeSave: false });

        sendTokenResponse(store, 200, res as AppResponse, 'Phone verified — login successful');
    }
);

// ─────────────────────────────────────────────
// @desc    Resend OTP
// @route   POST /api/v1/stores/auth/resend-otp
// @access  Public
// ─────────────────────────────────────────────
export const resendOTP = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const { phoneNumber } = req.body;

        if (!phoneNumber) {
            return next(new AppError('Phone number is required', 400));
        }

        const store = await Store.findOne({ phoneNumber }).select('+otp +otpExpiry');

        if (!store) {
            return next(new AppError('Store not found', 404));
        }

        const otp = store.generateOTP();
        await store.save({ validateBeforeSave: false });

        // TODO: Twilio
        console.log(`[STORE OTP RESEND] ${phoneNumber}: ${otp}`);

        const responseData: Record<string, unknown> = { phoneNumber };

        if (process.env.NODE_ENV === 'development') {
            responseData.otp = otp;
        }

        (res as AppResponse).data(responseData, 'OTP resent');
    }
);

// ─────────────────────────────────────────────
// @desc    Refresh access token
// @route   POST /api/v1/stores/auth/refresh-token
// @access  Public
// ─────────────────────────────────────────────
export const refreshToken = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return next(new AppError('Refresh token required', 400));
        }

        const jwt = await import('jsonwebtoken');
        const decoded = jwt.default.verify(
            refreshToken,
            process.env.JWT_STORE_REFRESH_SECRET as string
        ) as { id: string };

        const store = await Store.findById(decoded.id).select('+refreshToken');

        if (!store || store.refreshToken !== refreshToken) {
            return next(new AppError('Invalid refresh token', 401));
        }

        sendTokenResponse(store, 200, res as AppResponse, 'Token refreshed');
    }
);

// ─────────────────────────────────────────────
// @desc    Logout
// @route   POST /api/v1/stores/auth/logout
// @access  Store
// ─────────────────────────────────────────────
export const logout = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const store = await Store.findById((req as any).store?.id).select('+refreshToken');

        if (store) {
            store.refreshToken = undefined;
            await store.save({ validateBeforeSave: false });
        }

        res.cookie('storeToken', 'none', {
            expires: new Date(Date.now() + 10 * 1000),
            httpOnly: true
        });

        (res as AppResponse).success('Logged out successfully');
    }
);

// ─────────────────────────────────────────────
// @desc    Submit/update store profile (minimal registration)
// @route   POST /api/v1/stores/register  |  PUT /api/v1/stores/profile
// @access  Store
// ─────────────────────────────────────────────
export const registerProfile = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const storeId = (req as any).store?.id;

        const store = await Store.findById(storeId);
        if (!store) return next(new AppError('Store not found', 404));

        const {
            storeName,
            ownerName,
            category,
            address,
            referralCode: incomingReferralCode,
            description,
            openingHours,
            website
        } = req.body;

        // Apply fields
        if (storeName) store.storeName = storeName;
        if (ownerName) store.ownerName = ownerName;
        if (category) store.category = category;
        if (address) store.address = address;
        if (description) store.description = description;
        if (openingHours) store.openingHours = openingHours;
        if (website) store.website = website;

        // Handle referral code at registration
        if (incomingReferralCode && !store.referredBy) {
            const referrer = await Store.findOne({
                referralCode: incomingReferralCode,
                onboardingStatus: 'verified'
            });

            if (referrer && referrer._id.toString() !== storeId) {
                store.referredBy = referrer._id as any;

                // Create referral tracking record
                const Referral = (await import('../../models/Referral')).default;
                await Referral.create({
                    referrer: referrer._id,
                    referred: store._id,
                    referralCode: incomingReferralCode,
                    channel: 'link',
                    status: 'pending',
                    referredPhoneNumber: store.phoneNumber,
                    ipAtRegistration: req.ip,
                    'milestones.registeredAt': new Date(),
                    'milestones.phoneVerifiedAt': store.isPhoneVerified ? new Date() : undefined
                });
            }
        }

        // Recalculate profile score
        store.profileCompletionScore = calculateProfileScore(store.toObject());

        // Advance status
        const requiredFieldsPresent =
            store.storeName &&
            store.ownerName !== 'Pending' &&
            store.category &&
            store.address?.raw !== 'Pending';

        if (requiredFieldsPresent && store.onboardingStatus === 'phone_verified') {
            store.onboardingStatus = 'profile_complete';
        }else{
            store.onboardingStatus = 'verification';
        }

        await store.save();

        (res as AppResponse).data(
            {
                store: {
                    id: store._id,
                    storeName: store.storeName,
                    onboardingStatus: store.onboardingStatus,
                    profileCompletionScore: store.profileCompletionScore,
                    referralCode: store.referralCode
                }
            },
            'Profile updated successfully'
        );
    }
);

// ─────────────────────────────────────────────
// @desc    Get my store
// @route   GET /api/v1/stores/me
// @access  Store
// ─────────────────────────────────────────────
export const getMe = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const store = await Store.findById((req as any).store?.id).populate('category', 'name');

        if (!store) return next(new AppError('Store not found', 404));

        (res as AppResponse).data({ store }, 'Store retrieved');
    }
);

// ─────────────────────────────────────────────
// @desc    Get profile completion checklist
// @route   GET /api/v1/stores/profile/completion
// @access  Store
// ─────────────────────────────────────────────
export const getProfileCompletion = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const store = await Store.findById((req as any).store?.id);
        if (!store) return next(new AppError('Store not found', 404));

        const checklist = [
            { field: 'storeName', label: 'Store Name', complete: !!store.storeName, points: 15, required: true },
            { field: 'ownerName', label: 'Owner Name', complete: store.ownerName !== 'Pending' && !!store.ownerName, points: 10, required: true },
            { field: 'phoneNumber', label: 'Phone (verified)', complete: store.isPhoneVerified, points: 10, required: true },
            { field: 'category', label: 'Category', complete: !!store.category, points: 10, required: true },
            { field: 'address', label: 'Address', complete: store.address?.raw !== 'Pending' && !!store.address?.raw, points: 15, required: true },
            { field: 'photos', label: 'Store Photo', complete: store.photos?.length > 0, points: 15, required: false },
            { field: 'openingHours', label: 'Opening Hours', complete: store.openingHours?.length > 0, points: 10, required: false },
            { field: 'description', label: 'Description', complete: !!store.description, points: 10, required: false },
            { field: 'website', label: 'Website', complete: !!store.website, points: 5, required: false }
        ];

        (res as AppResponse).data(
            {
                score: store.profileCompletionScore,
                checklist,
                readyForVerification: store.profileCompletionScore >= 50
            },
            'Completion checklist'
        );
    }
);
