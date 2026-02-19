import { Request, Response, NextFunction } from 'express';
import User, { IUser } from '../models/User';
import Driver, { IDriver } from '../models/Driver';
import { AppError, asyncHandler, AppResponse } from '../middleware/error';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const sendTokenResponse = (user: IUser, statusCode: number, res: AppResponse, message: string) => {
    const token = user.getSignedJwtToken();
    const refreshToken = user.getRefreshToken();

    user.save({ validateBeforeSave: false });

    const options = {
        expires: new Date(
            Date.now() + (parseInt(process.env.JWT_COOKIE_EXPIRE || '7') * 24 * 60 * 60 * 1000)
        ),
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production'
    };

    res
        .status(statusCode)
        .cookie('token', token, options)
        .data(
            {
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    phoneNumber: user.phoneNumber,
                    role: user.role,
                    avatar: user.avatar,
                    isPhoneVerified: user.isPhoneVerified,
                    referralCode: user.referralCode
                },
                token,
                refreshToken
            },
            message,
            statusCode
        );
};

// @desc    Login user with phone number and send OTP
// @route   POST /api/v1/auth/login
// @access  Public
export const login = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { phoneNumber, password } = req.body;

    console.log('Login attempt for phone number:', phoneNumber, password);

    if (!phoneNumber) {
        return next(new AppError('Please provide phone number', 400));
    }

    // Find user by phone number
    const user = await User.findOne({ phoneNumber }).select('+otp +otpExpiry +password');

    if (!user) {
        return next(new AppError('No user found with this phone number', 404));
    }



    // If user is admin, verify password
    // if (user.role === 'admin') {
    //     if (!password) {
    //         return next(new AppError('Please provide password for admin login', 400));
    //     }

    //     // Check if password is correct
    //     const isPasswordMatch = await bcrypt.compare(password, user?.password || '');
    //     if (!isPasswordMatch) {
    //         return next(new AppError('Invalid password', 401));
    //     }

    //     // For admin, send token immediately without OTP
    //     sendTokenResponse(user, 200, res as AppResponse, 'Admin login successful');
    //     return;
    // }

    // For non-admin users, generate and send OTP
    const otp = user.generateOTP();
    await user.save({ validateBeforeSave: false });

    // TODO: Send OTP via SMS service (Twilio)
    console.log(`OTP for ${phoneNumber}: ${otp}`);

    const responseData: any = {
        phoneNumber,
        message: 'OTP sent successfully',
        requiresOTP: true
    };

    // Include OTP in response for development
    if (process.env.NODE_ENV === 'development') {
        responseData.otp = otp;
    }

    (res as AppResponse).data(responseData, 'OTP sent successfully for login');
});

// @desc    Verify OTP for login
// @route   POST /api/v1/auth/verify-login-otp
// @access  Public
export const verifyLoginOTP = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { phoneNumber, otp } = req.body;

    if (!phoneNumber || !otp) {
        return next(new AppError('Please provide phone number and OTP', 400));
    }

    const user = await User.findOne({ phoneNumber }).select('+otp +otpExpiry').populate('driverId');

    if (!user) {
        return next(new AppError('User not found', 404));
    }

    // Skip OTP verification for admin users
    // if (user.role === 'admin') {
    //     return next(new AppError('Admin users should use password login', 400));
    // }

    if (!user.verifyOTP(otp)) {
        return next(new AppError('Invalid or expired OTP', 401));
    }

    // Clear OTP fields
    user.otp = undefined;
    user.otpExpiry = undefined;

    // Mark phone as verified if not already
    if (!user.isPhoneVerified) {
        user.isPhoneVerified = true;
    }

    await user.save({ validateBeforeSave: false });
    sendTokenResponse(user, 200, res as AppResponse, 'Login successful');
});

// @desc    Send OTP to phone number
// @route   POST /api/v1/auth/send-otp
// @access  Public
export const sendOTP = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { phoneNumber, residentArea } = req.body;

    if (!phoneNumber) {
        return next(new AppError('Please provide phone number', 400));
    }

    let user = await User.findOne({ phoneNumber }).select('+otp +otpExpiry');

    if (!user) {
        user = await User.create({
            phoneNumber,
            residentArea,
            name: `User${phoneNumber.slice(-10)}`
        });
    }

    // Generate OTP
    const otp = user.generateOTP();
    await user.save({ validateBeforeSave: false });

    // TODO Reminder: Send OTP via SMS service (Twilio)
    console.log(`OTP for ${phoneNumber}: ${otp}`);

    // For development, include OTP in response
    const responseData: any = {
        phoneNumber,
        message: 'OTP sent successfully'
    };

    // this will be deleted in production
    if (process.env.NODE_ENV === 'development') {
        responseData.otp = otp; // Only in development
    }

    (res as AppResponse).data(responseData, 'OTP sent successfully');
});

// @desc    Verify OTP
// @route   POST /api/v1/auth/verify-otp
// @access  Public
export const verifyOTP = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { phoneNumber, otp } = req.body;

    if (!phoneNumber || !otp) {
        return next(new AppError('Please provide phone number and OTP', 400));
    }

    const user = await User.findOne({ phoneNumber }).select('+otp +otpExpiry').populate('driverId');

    if (!user) {
        return next(new AppError('User not found', 404));
    }

    if (!user.verifyOTP(otp)) {
        return next(new AppError('Invalid or expired OTP', 401));
    }

    user.isPhoneVerified = true;
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save({ validateBeforeSave: false });

    sendTokenResponse(user, 200, res as AppResponse, 'Phone verified successfully');
});

// @desc    Resend OTP
// @route   POST /api/v1/auth/resend-otp
// @access  Public
export const resendOTP = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
        return next(new AppError('Please provide phone number', 400));
    }

    const user = await User.findOne({ phoneNumber }).select('+otp +otpExpiry');

    if (!user) {
        return next(new AppError('User not found', 404));
    }

    // Generate new OTP
    const otp = user.generateOTP();
    await user.save({ validateBeforeSave: false });

    // when the twilio service is ready, iwill handle it here
    console.log(`New OTP for ${phoneNumber}: ${otp}`);

    const responseData: any = {
        phoneNumber,
        message: 'OTP resent successfully'
    };

    if (process.env.NODE_ENV === 'development') {
        responseData.otp = otp;
    }

    (res as AppResponse).data(responseData, 'OTP resent successfully');
});

// @desc    Complete profile
// @route   PUT /api/v1/auth/complete-profile
// @access  Private
export const completeProfile = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { name, email, referredBy } = req.body;

    if (!req.user) {
        return next(new AppError('Not authenticated', 401));
    }

    console.log(req.user);

    const user = await User.findById(req.user.id);

    if (!user) {
        return next(new AppError('User not found', 404));
    }

    // Update profile
    if (name) user.name = name;
    if (email) user.email = email;

    // Handle referral
    if (referredBy && !user.referredBy) {
        const referrer = await User.findOne({ referralCode: referredBy });
        if (referrer) {
            user.referredBy = referredBy;
        }
    }

    await user.save();

    (res as AppResponse).data(
        {
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                phoneNumber: user.phoneNumber,
                role: user.role,
                avatar: user.avatar,
                isPhoneVerified: user.isPhoneVerified,
                referralCode: user.referralCode
            }
        },
        'Profile updated successfully'
    );
});

// @desc    Update notification settings
// @route   PUT /api/v1/auth/notifications
// @access  Private
export const updateNotificationSettings = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { enabled } = req.body;

    if (!req.user) {
        return next(new AppError('Not authenticated', 401));
    }

    const user = await User.findById(req.user.id);

    if (!user) {
        return next(new AppError('User not found', 404));
    }

    user.notification_pref.push_notification = enabled;
    await user.save();

    (res as AppResponse).success('Notification settings updated');
});

// @desc    Update biometric settings
// @route   PUT /api/v1/auth/biometrics
// @access  Private
export const updateBiometricSettings = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { enabled } = req.body;

    if (!req.user) {
        return next(new AppError('Not authenticated', 401));
    }

    const user = await User.findById(req.user.id);

    if (!user) {
        return next(new AppError('User not found', 404));
    }

    user.biometricsEnabled = enabled;
    await user.save();

    (res as AppResponse).success('Biometric settings updated');
});

// @desc    Get current user
// @route   GET /api/v1/auth/me
// @access  Private
export const getMe = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
        return next(new AppError('Not authenticated', 401));
    }

    const user = await User.findById(req.user.id);

    if (!user) {
        return next(new AppError('User not found', 404));
    }

    (res as AppResponse).data({ user }, 'User retrieved successfully');
});

// @desc    Logout user
// @route   POST /api/v1/auth/logout
// @access  Private
export const logout = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
        return next(new AppError('Not authenticated', 401));
    }
    const user = await User.findById(req.user.id).select('+refreshToken');
    if (user) {
        user.refreshToken = undefined;
        await user.save({ validateBeforeSave: false });
    }

    res.cookie('token', 'none', {
        expires: new Date(Date.now() + 10 * 1000),
        httpOnly: true
    });

    (res as AppResponse).success('Logged out successfully');
});

// @desc    Refresh access token
// @route   POST /api/v1/auth/refresh-token
// @access  Public
export const refreshToken = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
        return next(new AppError('Please provide refresh token', 400));
    }

    const decoded: any = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET as string);

    const user = await User.findById((decoded as any).id).select('+refreshToken').populate('driverId');

    if (!user || user.refreshToken !== refreshToken) {
        return next(new AppError('Invalid refresh token', 401));
    }

    sendTokenResponse(user, 200, res as AppResponse, 'Token refreshed successfully');
});

export const getSearchHistory = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {

    if (!req.user) {
        return next(new AppError('Not authenticated', 401));
    }

    const users = await User.find().select('searchHistory');

    // Aggregate search queries to find popular searches
    const searchCounts: { [key: string]: number } = {};
    users.forEach(user => {
        user.searchHistory.forEach(query => {
            searchCounts[query] = (searchCounts[query] || 0) + 1;
        });
    });

    // Get top 10 popular searches
    const popularSearches = Object.entries(searchCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(entry => ({ query: entry[0], count: entry[1] }));


    const user = await User.findById(req.user.id);

    if (!user) {
        return next(new AppError('User not found', 404));
    }

    (res as AppResponse).data({ searchHistory: user.searchHistory, popularSearches }, 'Search history retrieved successfully');
});