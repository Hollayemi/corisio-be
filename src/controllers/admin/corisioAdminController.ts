import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import CorisioAdmin, {
    ICorisioAdmin,
    CORISIO_ROLES,
    CorisioRoleName,
    CorisioPermission,
    CORISIO_PERMISSIONS,
} from '../../models/admin/CorisioAdmin.model';
import { AppError, asyncHandler, AppResponse } from '../../middleware/error';

// ─────────────────────────────────────────────────────────────────────────────
// Helper — send token response
// ─────────────────────────────────────────────────────────────────────────────
const sendTokenResponse = (
    admin: ICorisioAdmin,
    statusCode: number,
    res: AppResponse,
    message: string
) => {
    const token = admin.getSignedJwtToken();
    const refreshToken = admin.getRefreshToken();

    admin.save({ validateBeforeSave: false }).catch(console.error);

    const cookieOptions = {
        expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
    };

    res.status(statusCode)
        .cookie('adminToken', token, cookieOptions)
        .data(
            {
                admin: {
                    id: admin._id,
                    firstName: admin.firstName,
                    lastName: admin.lastName,
                    email: admin.email,
                    role: admin.role,
                    permissions: admin.getResolvedPermissions(),
                    status: admin.status,
                    avatar: admin.avatar,
                },
                token,
                refreshToken,
            },
            message,
            statusCode
        );
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Login
// @route   POST /api/v1/corisio/admin/auth/login
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
export const login = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const { email, password } = req.body;

        if (!email || !password) {
            return next(new AppError('Email and password are required', 400));
        }

        const admin = await CorisioAdmin.findOne({ email }).select(
            '+password +refreshToken'
        );

        if (!admin) {
            return next(new AppError('Invalid credentials', 401));
        }

        if (admin.status === 'disabled') {
            return next(new AppError('This account has been disabled. Contact a super admin.', 403));
        }

        if (admin.status === 'suspended') {
            const until = admin.suspendedUntil
                ? ` until ${admin.suspendedUntil.toLocaleDateString()}`
                : '';
            return next(
                new AppError(
                    `Account suspended${until}. Reason: ${admin.suspensionReason ?? 'unspecified'}`,
                    403
                )
            );
        }

        const isMatch = await admin.matchPassword(password);
        if (!isMatch) {
            return next(new AppError('Invalid credentials', 401));
        }

        // Update login metadata
        admin.lastLogin = new Date();
        admin.lastLoginIp = req.ip;
        admin.loginCount = (admin.loginCount ?? 0) + 1;

        sendTokenResponse(admin, 200, res as AppResponse, 'Login successful');
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Logout
// @route   POST /api/v1/corisio/admin/auth/logout
// @access  CorisioAdmin
// ─────────────────────────────────────────────────────────────────────────────
export const logout = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const admin = await CorisioAdmin.findById(req.user?.id).select('+refreshToken');

        if (admin) {
            admin.refreshToken = undefined;
            await admin.save({ validateBeforeSave: false });
        }

        res.cookie('adminToken', 'none', {
            expires: new Date(Date.now() + 10 * 1000),
            httpOnly: true,
        });

        (res as AppResponse).success('Logged out successfully');
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Refresh access token
// @route   POST /api/v1/corisio/admin/auth/refresh-token
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
export const refreshToken = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const { refreshToken: incomingToken } = req.body;

        if (!incomingToken) {
            return next(new AppError('Refresh token required', 400));
        }

        const jwt = await import('jsonwebtoken');
        let decoded: any;

        try {
            decoded = jwt.default.verify(
                incomingToken,
                process.env.JWT_CORISIO_ADMIN_REFRESH_SECRET as string
            );
        } catch {
            return next(new AppError('Invalid or expired refresh token', 401));
        }

        const admin = await CorisioAdmin.findById(decoded.id).select('+refreshToken');

        if (!admin || admin.refreshToken !== incomingToken) {
            return next(new AppError('Invalid refresh token', 401));
        }

        if (admin.status !== 'active') {
            return next(new AppError('Account is not active', 403));
        }

        sendTokenResponse(admin, 200, res as AppResponse, 'Token refreshed');
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get my profile
// @route   GET /api/v1/corisio/admin/auth/me
// @access  CorisioAdmin
// ─────────────────────────────────────────────────────────────────────────────
export const getMe = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const admin = await CorisioAdmin.findById(req.user?.id);
        if (!admin) return next(new AppError('Admin not found', 404));

        (res as AppResponse).data(
            {
                admin: {
                    ...admin.toJSON(),
                    permissions: admin.getResolvedPermissions(),
                    roleDefinition: CORISIO_ROLES[admin.role as CorisioRoleName],
                },
            },
            'Profile retrieved'
        );
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Change own password
// @route   PUT /api/v1/corisio/admin/auth/change-password
// @access  CorisioAdmin
// ─────────────────────────────────────────────────────────────────────────────
export const changePassword = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return next(new AppError('Both currentPassword and newPassword are required', 400));
        }

        if (newPassword.length < 8) {
            return next(new AppError('New password must be at least 8 characters', 400));
        }

        const admin = await CorisioAdmin.findById(req.user?.id).select('+password');
        if (!admin) return next(new AppError('Admin not found', 404));

        const isMatch = await admin.matchPassword(currentPassword);
        if (!isMatch) {
            return next(new AppError('Current password is incorrect', 401));
        }

        admin.password = newPassword; // pre-save hook hashes it
        await admin.save();

        (res as AppResponse).success('Password changed successfully');
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Forgot password — generate reset token
// @route   POST /api/v1/corisio/admin/auth/forgot-password
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
export const forgotPassword = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const { email } = req.body;
        if (!email) return next(new AppError('Email is required', 400));

        const admin = await CorisioAdmin.findOne({ email });
        if (!admin) {
            // Don't reveal whether email exists
            return (res as AppResponse).success(
                'If that email is registered, a reset link has been sent'
            );
        }

        const resetToken = admin.createPasswordResetToken();
        await admin.save({ validateBeforeSave: false });

        const resetUrl = `${process.env.CORISIO_ADMIN_URL}/reset-password/${resetToken}`;

        // TODO: send email via nodemailer
        console.log(`[ADMIN PASSWORD RESET] ${admin.email} → ${resetUrl}`);

        (res as AppResponse).success(
            'If that email is registered, a reset link has been sent'
        );
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Reset password using token
// @route   PUT /api/v1/corisio/admin/auth/reset-password/:token
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
export const resetPassword = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const hashedToken = crypto
            .createHash('sha256')
            .update(req.params.token)
            .digest('hex');

        const admin = await CorisioAdmin.findOne({
            passwordResetToken: hashedToken,
            passwordResetExpiry: { $gt: new Date() },
        }).select('+passwordResetToken +passwordResetExpiry');

        if (!admin) {
            return next(new AppError('Reset token is invalid or has expired', 400));
        }

        const { newPassword } = req.body;
        if (!newPassword || newPassword.length < 8) {
            return next(new AppError('Password must be at least 8 characters', 400));
        }

        admin.password = newPassword;
        admin.passwordResetToken = undefined;
        admin.passwordResetExpiry = undefined;
        await admin.save();

        sendTokenResponse(admin, 200, res as AppResponse, 'Password reset successful');
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// @desc    List all admins
// @route   GET /api/v1/corisio/admin/admins
// @access  CorisioAdmin + view_admins
// ─────────────────────────────────────────────────────────────────────────────
export const getAllAdmins = asyncHandler(
    async (req: Request, res: Response, _next: NextFunction) => {
        const { role, status, page = 1, limit = 20 } = req.query;

        const query: Record<string, unknown> = {};
        if (role) query.role = role;
        if (status) query.status = status;

        const total = await CorisioAdmin.countDocuments(query);
        const admins = await CorisioAdmin.find(query)
            .populate('createdBy', 'firstName lastName email')
            .sort({ createdAt: -1 })
            .skip((Number(page) - 1) * Number(limit))
            .limit(Number(limit));

        (res as AppResponse).data(
            {
                total,
                page: Number(page),
                limit: Number(limit),
                admins: admins.map((a) => ({
                    ...a.toJSON(),
                    permissions: a.getResolvedPermissions(),
                })),
            },
            'Admins retrieved'
        );
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get single admin
// @route   GET /api/v1/corisio/admin/admins/:id
// @access  CorisioAdmin + view_admins
// ─────────────────────────────────────────────────────────────────────────────
export const getAdminById = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const admin = await CorisioAdmin.findById(req.params.id).populate(
            'createdBy',
            'firstName lastName email'
        );

        if (!admin) return next(new AppError('Admin not found', 404));

        (res as AppResponse).data(
            {
                admin: {
                    ...admin.toJSON(),
                    permissions: admin.getResolvedPermissions(),
                    roleDefinition: CORISIO_ROLES[admin.role as CorisioRoleName],
                },
            },
            'Admin retrieved'
        );
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Create admin account
// @route   POST /api/v1/corisio/admin/admins
// @access  SuperAdmin + manage_admins
// ─────────────────────────────────────────────────────────────────────────────
export const createAdmin = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const { firstName, lastName, email, password, role, customPermissions } = req.body;

        if (!firstName || !lastName || !email || !password || !role) {
            return next(
                new AppError('firstName, lastName, email, password and role are required', 400)
            );
        }

        if (!Object.keys(CORISIO_ROLES).includes(role)) {
            return next(
                new AppError(`Invalid role. Must be one of: ${Object.keys(CORISIO_ROLES).join(', ')}`, 400)
            );
        }

        // Only super_admin can create other super_admins
        if (role === 'super_admin' && req.user?.role !== 'super_admin') {
            return next(new AppError('Only a super admin can create another super admin', 403));
        }

        const existing = await CorisioAdmin.findOne({ email });
        if (existing) {
            return next(new AppError('An admin with this email already exists', 409));
        }

        const admin = await CorisioAdmin.create({
            firstName,
            lastName,
            email,
            password,
            role,
            customPermissions: customPermissions ?? [],
            createdBy: req.user?.id,
        });

        (res as AppResponse).data(
            {
                admin: {
                    ...admin.toJSON(),
                    permissions: admin.getResolvedPermissions(),
                },
            },
            'Admin account created',
            201
        );
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Update admin (role, customPermissions, revokedPermissions)
// @route   PUT /api/v1/corisio/admin/admins/:id
// @access  SuperAdmin + manage_admins
// ─────────────────────────────────────────────────────────────────────────────
export const updateAdmin = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const { role, customPermissions, revokedPermissions, firstName, lastName, phoneNumber } =
            req.body;

        const admin = await CorisioAdmin.findById(req.params.id);
        if (!admin) return next(new AppError('Admin not found', 404));

        // Guard: can't demote / edit another super_admin unless you're one too
        if (admin.role === 'super_admin' && req.user?.role !== 'super_admin') {
            return next(new AppError('Cannot modify a super admin account', 403));
        }

        if (firstName) admin.firstName = firstName;
        if (lastName) admin.lastName = lastName;
        if (phoneNumber) admin.phoneNumber = phoneNumber;

        if (role) {
            if (!Object.keys(CORISIO_ROLES).includes(role)) {
                return next(new AppError('Invalid role', 400));
            }
            if (role === 'super_admin' && req.user?.role !== 'super_admin') {
                return next(new AppError('Only a super admin can assign the super_admin role', 403));
            }
            admin.role = role as CorisioRoleName;
        }

        if (customPermissions !== undefined) {
            const invalid = customPermissions.filter(
                (p: string) => !CORISIO_PERMISSIONS.includes(p as CorisioPermission)
            );
            if (invalid.length > 0) {
                return next(new AppError(`Invalid permissions: ${invalid.join(', ')}`, 400));
            }
            admin.customPermissions = customPermissions;
        }

        if (revokedPermissions !== undefined) {
            const invalid = revokedPermissions.filter(
                (p: string) => !CORISIO_PERMISSIONS.includes(p as CorisioPermission)
            );
            if (invalid.length > 0) {
                return next(new AppError(`Invalid revoked permissions: ${invalid.join(', ')}`, 400));
            }
            admin.revokedPermissions = revokedPermissions;
        }

        await admin.save();

        (res as AppResponse).data(
            {
                admin: {
                    ...admin.toJSON(),
                    permissions: admin.getResolvedPermissions(),
                },
            },
            'Admin updated'
        );
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Suspend admin
// @route   POST /api/v1/corisio/admin/admins/:id/suspend
// @access  SuperAdmin + manage_admins
// ─────────────────────────────────────────────────────────────────────────────
export const suspendAdmin = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const { reason, durationDays } = req.body;

        if (!reason) return next(new AppError('Suspension reason is required', 400));

        const admin = await CorisioAdmin.findById(req.params.id);
        if (!admin) return next(new AppError('Admin not found', 404));

        if (admin.role === 'super_admin') {
            return next(new AppError('Cannot suspend a super admin', 403));
        }

        if (admin._id.toString() === req.user?.id) {
            return next(new AppError('You cannot suspend your own account', 403));
        }

        admin.status = 'suspended';
        admin.suspensionReason = reason;
        admin.suspendedAt = new Date();
        admin.suspendedBy = req.user?.id;
        admin.suspendedUntil = durationDays
            ? new Date(Date.now() + Number(durationDays) * 86_400_000)
            : undefined;

        await admin.save();

        (res as AppResponse).success('Admin account suspended');
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Unsuspend admin
// @route   POST /api/v1/corisio/admin/admins/:id/unsuspend
// @access  SuperAdmin + manage_admins
// ─────────────────────────────────────────────────────────────────────────────
export const unsuspendAdmin = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const admin = await CorisioAdmin.findById(req.params.id);
        if (!admin) return next(new AppError('Admin not found', 404));

        admin.status = 'active';
        admin.suspensionReason = undefined;
        admin.suspendedAt = undefined;
        admin.suspendedUntil = undefined;
        admin.suspendedBy = undefined;

        await admin.save();

        (res as AppResponse).success('Admin account reinstated');
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Disable admin (permanent)
// @route   POST /api/v1/corisio/admin/admins/:id/disable
// @access  SuperAdmin + manage_admins
// ─────────────────────────────────────────────────────────────────────────────
export const disableAdmin = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const admin = await CorisioAdmin.findById(req.params.id);
        if (!admin) return next(new AppError('Admin not found', 404));

        if (admin.role === 'super_admin') {
            return next(new AppError('Cannot disable a super admin', 403));
        }

        if (admin._id.toString() === req.user?.id) {
            return next(new AppError('You cannot disable your own account', 403));
        }

        admin.status = 'disabled';
        await admin.save();

        (res as AppResponse).success('Admin account disabled');
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Admin resets another admin's password
// @route   POST /api/v1/corisio/admin/admins/:id/reset-password
// @access  SuperAdmin + manage_admins
// ─────────────────────────────────────────────────────────────────────────────
export const adminResetPassword = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const admin = await CorisioAdmin.findById(req.params.id);
        if (!admin) return next(new AppError('Admin not found', 404));

        // Generate a temporary password
        const tempPassword =
            crypto.randomBytes(8).toString('hex') + 'A1!'; // meets length + complexity

        admin.password = tempPassword; // pre-save hook hashes it
        await admin.save();

        // TODO: email tempPassword to admin.email
        console.log(`[ADMIN RESET] ${admin.email} temp password: ${tempPassword}`);

        (res as AppResponse).data(
            process.env.NODE_ENV === 'development' ? { tempPassword } : {},
            'Password reset. Admin will receive the new password via email.'
        );
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Delete admin account (hard delete — super admin only)
// @route   DELETE /api/v1/corisio/admin/admins/:id
// @access  SuperAdmin + manage_admins
// ─────────────────────────────────────────────────────────────────────────────
export const deleteAdmin = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const admin = await CorisioAdmin.findById(req.params.id);
        if (!admin) return next(new AppError('Admin not found', 404));

        if (admin.role === 'super_admin') {
            return next(new AppError('Cannot delete a super admin account', 403));
        }

        if (admin._id.toString() === req.user?.id) {
            return next(new AppError('You cannot delete your own account', 403));
        }

        await CorisioAdmin.findByIdAndDelete(req.params.id);

        (res as AppResponse).success('Admin account permanently deleted');
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get available roles and their permission sets
// @route   GET /api/v1/corisio/admin/roles
// @access  CorisioAdmin + view_admins
// ─────────────────────────────────────────────────────────────────────────────
export const getRolesAndPermissions = asyncHandler(
    async (_req: Request, res: Response, _next: NextFunction) => {
        (res as AppResponse).data(
            {
                roles: CORISIO_ROLES,
                allPermissions: CORISIO_PERMISSIONS,
            },
            'Roles and permissions'
        );
    }
);
