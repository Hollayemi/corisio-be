import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import Store, { IStore } from '../models/stores/Store';
import { AppError, asyncHandler } from './error';

// Extend Express Request to include store
declare global {
    namespace Express {
        interface Request {
            store?: IStore;
        }
    }
}

// ─────────────────────────────────────────────
// Protect store routes — verify JWT
// ─────────────────────────────────────────────
export const protectStore = asyncHandler(
    async (req: Request, _res: Response, next: NextFunction) => {
        let token: string | undefined;

        // console.log('Checking store auth...', req);

        if (req.cookies?.storeToken) {
            token = req.cookies.storeToken;
        } else if (
            req.headers.authorization &&
            req.headers.authorization.startsWith('Bearer')
        ) {
            token = req.headers.authorization.split(' ')[1];
        }

        console.log({ token });

        if (!token) {
            return next(new AppError('Not authorized — please log in', 401, 'UNAUTHORIZED'));
        }

        const decoded = jwt.verify(
            token,
            process.env.JWT_STORE_SECRET as string
        ) as { id: string; type: string };

        if (decoded.type !== 'store') {
            return next(new AppError('Invalid token type', 401, 'UNAUTHORIZED'));
        }

        const store = await Store.findById(decoded.id).populate('ownerInfo', 'name email phone');

        if (!store) {
            return next(new AppError('Store no longer exists', 401));
        }

        if (!store.isPhoneVerified) {
            return next(new AppError('Please verify your phone number first', 401));
        }

        if (!store.isActive) {
            return next(new AppError('Store account is disabled', 403));
        }

        req.store = store;
        req.user = store.ownerInfo as any; // attach owner info to req.user for convenience


        next();
    }
);

// ─────────────────────────────────────────────
// Only verified stores can perform certain actions (e.g. send referrals)
// ─────────────────────────────────────────────
export const requireVerifiedStore = (
    req: Request,
    _res: Response,
    next: NextFunction
) => {
    if (req.store?.onboardingStatus !== 'verified') {
        return next(
            new AppError(
                'Your store must be verified before you can perform this action',
                403
            )
        );
    }
    next();
};

// ─────────────────────────────────────────────
// Optional store token — attach store if token present, don't fail if absent
// ─────────────────────────────────────────────
export const ifStoreToken = asyncHandler(
    async (req: Request, _res: Response, next: NextFunction) => {
        let token: string | undefined;

        if (req.cookies?.storeToken) {
            token = req.cookies.storeToken;
        } else if (
            req.headers.authorization &&
            req.headers.authorization.startsWith('Bearer')
        ) {
            token = req.headers.authorization.split(' ')[1];
        }


        console.log({ token });

        if (!token) return next();

        try {
            const decoded = jwt.verify(
                token,
                process.env.JWT_STORE_SECRET as string
            ) as { id: string; type: string };

            if (decoded.type === 'store') {
                const store = await Store.findById(decoded.id);
                if (store) req.store = store;
            }
        } catch {
            // silently ignore invalid token for optional routes
        }

        next();
    }
);
