import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import Staff, {IStaff} from '../models/admin/Staff.model';
import User, {IUser} from '../models/User';
import Role from '../models/admin/Roles.models';
import { AppError, asyncHandler } from './error';

// Extend Express Request to include user
declare global {
    namespace Express {
        interface Request {
            user?: IUser | IStaff & { permissions: string[] } | any;
        }
    }
}

// Protect routes - verify JWT token
export const ifToken = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    let token;

    // Check for token in Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

     else if (req.cookies?.token) {
        token = req.cookies.token;
    }


    if (!token) {
        return next();
    }

    try {
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
        const user = await User.findById(decoded.id) as IUser;
        req.user = user;
        return next();
      
    } catch (error) {
        return next(new AppError('--Not authorized to access this route', 401, 'UNAUTHORIZED'));
    }
});

// Protect routes - verify JWT token
export const protect = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    let token;

    // Check for token in Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

     else if (req.cookies?.token) {
        token = req.cookies.token;
    }


    if (!token) {
        return next(new AppError('-Not authorized to access this route', 401, 'UNAUTHORIZED'));
    }

    try {
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;

        console.log({decoded})
        if(decoded.role === 'user' || decoded.role === 'driver'){
             const user = await User.findById(decoded.id) as IUser;


            if (!user) {
                return next(new AppError('User no longer exists', 401));
            }

            if (!user.isPhoneVerified) {
                return next(new AppError('Please verify your phone number', 401));
            }

            req.user = user;
            return next();
        }

        console.log('Decoded JWT:', decoded);

        // Get user from token
        const staff = await Staff.findById(decoded.id)
            .populate('role', 'name displayName permissions')
            .select('-password');

        if (!staff) {
            return next(new AppError('User no longer exists', 401, 'UNAUTHORIZED'));
        }

        // Check if account is active
        if (staff.status === 'suspended') {
            return next(new AppError('Account is suspended', 403, 'FORBIDDEN'));
        }

        if (staff.status === 'disabled') {
            return next(new AppError('Account is disabled', 403, 'FORBIDDEN'));
        }

        // Check if suspension has expired
        if (staff.status !== 'active' && staff.suspendedUntil) {
            if (new Date() > staff.suspendedUntil) {
                staff.status = 'active';
                staff.suspendedAt = undefined;
                staff.suspendedUntil = undefined;
                staff.suspensionReason = undefined;
                await staff.save();
            }
        }

        // Combine role permissions with custom permissions
        const rolePermissions = (staff.role as any).permissions || [];
        const allPermissions = [...new Set([...rolePermissions, ...staff.customPermissions])];

        // Add user to request
        const staffWithPermissions = {
            ...staff.toObject(),
            permissions: allPermissions
        };
        // req.user.isAdmin = true
        req.user = staffWithPermissions;

        next();
    } catch (error) {
        return next(new AppError('--Not authorized to access this route', 401, 'UNAUTHORIZED'));
    }
});

// Check for specific permission
export const checkPermission = (permission: string) => {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.user) {
            return next(new AppError('Not authenticated', 401, 'UNAUTHORIZED'));
        }

        if (!req.user.permissions.includes(permission)) {
            return next(new AppError(
                `You do not have permission to perform this action. Required permission: ${permission}`,
                403,
                'FORBIDDEN'
            ));
        }

        next();
    };
};

// Check for multiple permissions (user must have ALL)
export const checkPermissions = (...permissions: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.user) {
            return next(new AppError('Not authenticated', 401, 'UNAUTHORIZED'));
        }

        const hasAllPermissions = permissions.every(permission =>
            req.user!.permissions.includes(permission)
        );

        if (!hasAllPermissions) {
            return next(new AppError(
                `You do not have all required permissions. Required: ${permissions.join(', ')}`,
                403,
                'FORBIDDEN'
            ));
        }

        next();
    };
};

// Check for any of multiple permissions (user must have AT LEAST ONE)
export const checkAnyPermission = (...permissions: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.user) {
            return next(new AppError('Not authenticated', 401, 'UNAUTHORIZED'));
        }

        const hasAnyPermission = permissions.some(permission =>
            req.user!.permissions.includes(permission)
        );

        if (!hasAnyPermission) {
            return next(new AppError(
                `You do not have any of the required permissions. Required one of: ${permissions.join(', ')}`,
                403,
                'FORBIDDEN'
            ));
        }

        next();
    };
};

// Authorize based on role (legacy - prefer permission-based)
export const authorize = (...roles: string[]) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        if (!req.user) {
            return next(new AppError('Not authenticated', 401, 'UNAUTHORIZED'));
        }

        const staff = await Staff.findById(req.user.id).populate('role', 'name');

        if (!staff) {
            return next(new AppError('User not found', 404));
        }

        const roleName = (staff.role as any).name;

        // if (!roles.includes(roleName)) {
        //     return next(new AppError(
        //         `User role '${roleName}' is not authorized to access this route`,
        //         403,
        //         'FORBIDDEN'
        //     ));
        // }

        next();
    };
};

// Check if user is the owner of a resource or has permission
export const checkOwnerOrPermission = (permission: string) => {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.user) {
            return next(new AppError('Not authenticated', 401, 'UNAUTHORIZED'));
        }

        // Allow if user has the permission
        if (req.user.permissions.includes(permission)) {
            return next();
        }

        // Allow if user is the owner (ID matches)
        if (req.params.id === req.user.id) {
            return next();
        }

        return next(new AppError(
            'You do not have permission to perform this action',
            403,
            'FORBIDDEN'
        ));
    };
};