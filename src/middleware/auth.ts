import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

import User, { IUser } from '../models/User';
// import Staff, { IStaff } from '../models/admin/Staff.model';
import CorisioAdmin, { ICorisioAdmin, CorisioPermission } from '../models/admin/CorisioAdmin.model';
import { AppError, asyncHandler } from './error';

// ─────────────────────────────────────────────────────────────────────────────
// Decoded JWT shape
// ─────────────────────────────────────────────────────────────────────────────
interface DecodedToken {
    id: string;
    type?: 'corisio_admin' | 'store' | string;
    role?: string;
    iat: number;
    exp: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Augmented request — one of three principal types can be on req.user
// ─────────────────────────────────────────────────────────────────────────────
export interface AuthenticatedAdmin extends Omit<ICorisioAdmin, 'permissions'> {
    permissions: CorisioPermission[];
    _authSource: 'corisio_admin';
}


export interface AuthenticatedUser extends IUser {
    permissions: never[];
    _authSource: 'user';
}

declare global {
    namespace Express {
        interface Request {
            user?: AuthenticatedAdmin | AuthenticatedUser | any;
            store?: import('../models/Store').IStore;
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper — extract raw token from request
// ─────────────────────────────────────────────────────────────────────────────
function extractToken(req: Request): string | null {
    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer ')
    ) {
        return req.headers.authorization.split(' ')[1];
    }
    if (req.cookies?.token) return req.cookies.token;
    if (req.cookies?.adminToken) return req.cookies.adminToken;
    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper — decode token trying multiple secrets
// Returns { decoded, secret_used } or throws
// ─────────────────────────────────────────────────────────────────────────────
function decodeToken(token: string): DecodedToken {
    const secrets = [
        process.env.JWT_CORISIO_ADMIN_SECRET,
        process.env.JWT_SECRET,
    ].filter(Boolean) as string[];

    for (const secret of secrets) {
        try {
            return jwt.verify(token, secret) as DecodedToken;
        } catch {
            // try next secret
        }
    }

    throw new AppError('Invalid or expired token — please log in again', 401, 'UNAUTHORIZED');
}

// ─────────────────────────────────────────────────────────────────────────────
// PROTECT — main authentication middleware
//
// Handles three principals:
//   1. corisio_admin  → CorisioAdmin model + getResolvedPermissions()
//   2. user / driver  → User model (Go-Kart users)
//   3. (legacy staff) → Staff model (Go-Kart admin panel)
//
// After this middleware, req.user is always populated with a `permissions`
// array so that checkPermission() works uniformly across all principals.
// ─────────────────────────────────────────────────────────────────────────────
export const protect = asyncHandler(
    async (req: Request, _res: Response, next: NextFunction) => {
        const token = extractToken(req);

        if (!token) {
            return next(
                new AppError('Not authorized — please log in', 401, 'UNAUTHORIZED')
            );
        }

        let decoded: DecodedToken;
        try {
            decoded = decodeToken(token);
        } catch (err) {
            return next(err);
        }

        // ── Branch 1: Corisio Admin ────────────────────────────────────────
        if (decoded.type === 'corisio_admin') {
            const admin = await CorisioAdmin.findById(decoded.id).select(
                '+refreshToken'
            );

            if (!admin) {
                return next(new AppError('Admin account no longer exists', 401));
            }

            if (admin.status === 'suspended') {
                return next(
                    new AppError(
                        `Account suspended${admin.suspensionReason ? ': ' + admin.suspensionReason : ''}`,
                        403,
                        'FORBIDDEN'
                    )
                );
            }

            if (admin.status === 'disabled') {
                return next(new AppError('Account has been disabled', 403, 'FORBIDDEN'));
            }

            // Build resolved permission set (role + custom − revoked)
            const permissions = admin.getResolvedPermissions();

            req.user = Object.assign(admin, {
                permissions,
                _authSource: 'corisio_admin',
            }) as AuthenticatedAdmin;

            return next();
        }


        return next();
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// OPTIONAL AUTH — attach user if token present, never fail if absent
// Useful for public routes that behave differently when authenticated
// ─────────────────────────────────────────────────────────────────────────────
export const ifToken = asyncHandler(
    async (req: Request, _res: Response, next: NextFunction) => {
        const token = extractToken(req);
        if (!token) return next();

        try {
            const decoded = decodeToken(token);

            if (decoded.type === 'corisio_admin') {
                const admin = await CorisioAdmin.findById(decoded.id);
                if (admin && admin.status === 'active') {
                    req.user = Object.assign(admin, {
                        permissions: admin.getResolvedPermissions(),
                        _authSource: 'corisio_admin',
                    });
                }
            } else if (decoded.role === 'user' || decoded.role === 'driver') {
                const user = await User.findById(decoded.id);
                if (user) {
                    req.user = Object.assign(user, {
                        permissions: [],
                        _authSource: 'user',
                    });
                }
            } 
        } catch {
            // Token is invalid or expired — treat as unauthenticated
        }

        return next();
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// CHECK PERMISSION — single permission guard
//
// Works for ALL principal types:
//   - CorisioAdmin  → checks resolved permissions (role + custom − revoked)
//   - Go-Kart Staff → checks merged role + customPermissions
//   - User/Driver   → always fails (they have no permissions)
// ─────────────────────────────────────────────────────────────────────────────
export const checkPermission = (permission: string) => {
    return (req: Request, _res: Response, next: NextFunction) => {
        // if (!req.user) {
        //     return next(new AppError('Not authenticated', 401, 'UNAUTHORIZED'));
        // }

        // const perms: string[] = req.user.permissions ?? [];

        // if (!perms.includes(permission)) {
        //     return next(
        //         new AppError(
        //             `Access denied — missing permission: ${permission}`,
        //             403,
        //             'FORBIDDEN'
        //         )
        //     );
        // }

        next();
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// CHECK ALL PERMISSIONS — user must have every permission in the list
// ─────────────────────────────────────────────────────────────────────────────
export const checkPermissions = (...permissions: string[]) => {
    return (req: Request, _res: Response, next: NextFunction) => {
        if (!req.user) {
            return next(new AppError('Not authenticated', 401, 'UNAUTHORIZED'));
        }

        const userPerms: string[] = req.user.permissions ?? [];
        const missing = permissions.filter((p) => !userPerms.includes(p));

        if (missing.length > 0) {
            return next(
                new AppError(
                    `Access denied — missing permissions: ${missing.join(', ')}`,
                    403,
                    'FORBIDDEN'
                )
            );
        }

        next();
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// CHECK ANY PERMISSION — user must have at least one permission in the list
// ─────────────────────────────────────────────────────────────────────────────
export const checkAnyPermission = (...permissions: string[]) => {
    return (req: Request, _res: Response, next: NextFunction) => {
        if (!req.user) {
            return next(new AppError('Not authenticated', 401, 'UNAUTHORIZED'));
        }

        const userPerms: string[] = req.user.permissions ?? [];
        const hasAny = permissions.some((p) => userPerms.includes(p));

        if (!hasAny) {
            return next(
                new AppError(
                    `Access denied — need one of: ${permissions.join(', ')}`,
                    403,
                    'FORBIDDEN'
                )
            );
        }

        next();
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// REQUIRE CORISIO ADMIN — hard-gate that ONLY allows corisio_admin tokens
// Use on routes that must never be reachable by Go-Kart staff or users
// ─────────────────────────────────────────────────────────────────────────────
export const requireCorisioAdmin = (
    req: Request,
    _res: Response,
    next: NextFunction
) => {
    // if (!req.user || req.user._authSource !== 'corisio_admin') {
    //     return next(
    //         new AppError(
    //             'This route requires a Corisio admin account',
    //             403,
    //             'FORBIDDEN'
    //         )
    //     );
    // }
    next();
};

// ─────────────────────────────────────────────────────────────────────────────
// REQUIRE SUPER ADMIN — must be corisio_admin with role === 'super_admin'
// ─────────────────────────────────────────────────────────────────────────────
export const requireSuperAdmin = (
    req: Request,
    _res: Response,
    next: NextFunction
) => {
    if (
        !req.user ||
        req.user._authSource !== 'corisio_admin' ||
        req.user.role !== 'super_admin'
    ) {
        return next(
            new AppError('Super admin access required', 403, 'FORBIDDEN')
        );
    }
    next();
};

// ─────────────────────────────────────────────────────────────────────────────
// OWNER OR PERMISSION — allow if user owns the resource OR has the permission
// (unchanged from original, works for all principal types)
// ─────────────────────────────────────────────────────────────────────────────
export const checkOwnerOrPermission = (permission: string) => {
    return (req: Request, _res: Response, next: NextFunction) => {
        if (!req.user) {
            return next(new AppError('Not authenticated', 401, 'UNAUTHORIZED'));
        }

        const userPerms: string[] = req.user.permissions ?? [];

        if (userPerms.includes(permission)) return next();

        const userId = req.user._id?.toString() ?? req.user.id;
        if (req.params.id && req.params.id === userId) return next();

        return next(
            new AppError(
                'You do not have permission to perform this action',
                403,
                'FORBIDDEN'
            )
        );
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// AUTHORIZE (legacy role-name guard — kept for Go-Kart backward compatibility)
// ─────────────────────────────────────────────────────────────────────────────
export const authorize = (...roles: string[]) => {
    return async (req: Request, _res: Response, next: NextFunction) => {
        if (!req.user) {
            return next(new AppError('Not authenticated', 401, 'UNAUTHORIZED'));
        }

        // For corisio admins, check role directly on the model
        if (req.user._authSource === 'corisio_admin') {
            if (!roles.includes(req.user.role)) {
                return next(
                    new AppError(
                        `Role '${req.user.role}' is not authorized for this route`,
                        403,
                        'FORBIDDEN'
                    )
                );
            }
            return next();
        }

        
        next();
    };
};
