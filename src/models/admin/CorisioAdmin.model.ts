import mongoose, { Document, Schema, Types } from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Permissions available in the Corisio admin system
// These map directly to what checkPermission() guards look for
// ─────────────────────────────────────────────────────────────────────────────
export const CORISIO_PERMISSIONS = [
    // Store management
    'view_stores',        // view any store, pending queue, store detail
    'create_stores',      // verify stores, reject stores
    'edit_stores',        // update store data directly
    'delete_stores',      // hard-delete a store record

    // Referral management
    'view_referrals',     // list all referrals, filter, export
    'manage_referrals',   // flag / unflag referrals, override status

    // Boost management
    'view_boosts',        // view boost status and ledger
    'manage_boosts',      // grant / revoke boosts manually

    // Analytics & Reports
    'access_reports',     // view onboarding funnel, cluster density, referral analytics

    // Admin user management (super-admin only)
    'view_admins',        // list other admin accounts
    'manage_admins',      // create / suspend / delete admin accounts

    // Platform config
    'manage_config',      // edit categories, regions, platform settings
] as const;

export type CorisioPermission = typeof CORISIO_PERMISSIONS[number];

// ─────────────────────────────────────────────────────────────────────────────
// Predefined role templates — the actual Role is stored inline on the admin
// document for simplicity (no separate Role collection needed for Corisio)
// ─────────────────────────────────────────────────────────────────────────────
export const CORISIO_ROLES = {
    super_admin: {
        name: 'super_admin',
        displayName: 'Super Admin',
        permissions: [...CORISIO_PERMISSIONS] as CorisioPermission[],
    },
    admin: {
        name: 'admin',
        displayName: 'Admin',
        permissions: [
            'view_stores',
            'create_stores',
            'edit_stores',
            'view_referrals',
            'manage_referrals',
            'view_boosts',
            'manage_boosts',
            'access_reports',
            'manage_config',
        ] as CorisioPermission[],
    },
    verification_agent: {
        name: 'verification_agent',
        displayName: 'Verification Agent',
        permissions: [
            'view_stores',
            'create_stores', // verify / reject
            'view_referrals',
            'view_boosts',
        ] as CorisioPermission[],
    },
    analyst: {
        name: 'analyst',
        displayName: 'Analyst',
        permissions: [
            'view_stores',
            'view_referrals',
            'view_boosts',
            'access_reports',
        ] as CorisioPermission[],
    },
} as const;

export type CorisioRoleName = keyof typeof CORISIO_ROLES;

// ─────────────────────────────────────────────────────────────────────────────
// Interface
// ─────────────────────────────────────────────────────────────────────────────
export interface ICorisioAdmin extends Document {
    // Identity
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    phoneNumber?: string;
    avatar?: string;

    // Role & permissions
    role: CorisioRoleName;
    customPermissions: CorisioPermission[];   // extra permissions on top of role
    revokedPermissions: CorisioPermission[];  // permissions stripped from role

    // Computed (not stored — built at login time from role + custom - revoked)
    permissions?: CorisioPermission[];

    // Account status
    status: 'active' | 'suspended' | 'disabled';
    suspensionReason?: string;
    suspendedAt?: Date;
    suspendedUntil?: Date;
    suspendedBy?: Types.ObjectId;

    // Security
    lastLogin?: Date;
    lastLoginIp?: string;
    loginCount: number;
    passwordChangedAt?: Date;
    passwordResetToken?: string;
    passwordResetExpiry?: Date;
    refreshToken?: string;

    // Audit
    createdBy?: Types.ObjectId;  // which super_admin created this account

    createdAt: Date;
    updatedAt: Date;

    // Methods
    getFullName(): string;
    matchPassword(enteredPassword: string): Promise<boolean>;
    getSignedJwtToken(): string;
    getRefreshToken(): string;
    getResolvedPermissions(): CorisioPermission[];
    createPasswordResetToken(): string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────────────────────────────────────
const CorisioAdminSchema = new Schema<ICorisioAdmin>(
    {
        firstName: {
            type: String,
            required: [true, 'First name is required'],
            trim: true,
            maxlength: [50, 'First name cannot exceed 50 characters'],
        },
        lastName: {
            type: String,
            required: [true, 'Last name is required'],
            trim: true,
            maxlength: [50, 'Last name cannot exceed 50 characters'],
        },
        email: {
            type: String,
            required: [true, 'Email is required'],
            unique: true,
            lowercase: true,
            trim: true,
            index: true,
            match: [
                /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
                'Please provide a valid email address',
            ],
        },
        password: {
            type: String,
            required: [true, 'Password is required'],
            minlength: [8, 'Password must be at least 8 characters'],
            select: false,
        },
        phoneNumber: {
            type: String,
            trim: true,
            sparse: true,
        },
        avatar: {
            type: String,
            default: null,
        },

        // Role
        role: {
            type: String,
            enum: Object.keys(CORISIO_ROLES),
            required: [true, 'Role is required'],
            default: 'verification_agent',
            index: true,
        },
        customPermissions: {
            type: [String],
            enum: CORISIO_PERMISSIONS,
            default: [],
        },
        revokedPermissions: {
            type: [String],
            enum: CORISIO_PERMISSIONS,
            default: [],
        },

        // Account status
        status: {
            type: String,
            enum: ['active', 'suspended', 'disabled'],
            default: 'active',
            index: true,
        },
        suspensionReason: { type: String },
        suspendedAt: { type: Date },
        suspendedUntil: { type: Date },
        suspendedBy: { type: Schema.Types.ObjectId, ref: 'CorisioAdmin' },

        // Security
        lastLogin: { type: Date },
        lastLoginIp: { type: String, select: false },
        loginCount: { type: Number, default: 0 },
        passwordChangedAt: { type: Date, select: false },
        passwordResetToken: { type: String, select: false },
        passwordResetExpiry: { type: Date, select: false },
        refreshToken: { type: String, select: false },

        // Audit
        createdBy: { type: Schema.Types.ObjectId, ref: 'CorisioAdmin' },
    },
    {
        timestamps: true,
        toJSON: {
            virtuals: true,
            transform: (_doc, ret: any) => {
                delete ret.password;
                delete ret.refreshToken;
                delete ret.passwordResetToken;
                delete ret.passwordResetExpiry;
                delete ret.passwordChangedAt;
                delete ret.lastLoginIp;
                return ret;
            },
        },
        toObject: { virtuals: true },
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// Indexes
// ─────────────────────────────────────────────────────────────────────────────
CorisioAdminSchema.index({ email: 1 }, { unique: true });
CorisioAdminSchema.index({ role: 1, status: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// Virtuals
// ─────────────────────────────────────────────────────────────────────────────
CorisioAdminSchema.virtual('fullName').get(function (this: ICorisioAdmin) {
    return `${this.firstName} ${this.lastName}`;
});

// ─────────────────────────────────────────────────────────────────────────────
// Pre-save hooks
// ─────────────────────────────────────────────────────────────────────────────
CorisioAdminSchema.pre('save', async function (next) {
    // Hash password only when it has been modified
    if (!this.isModified('password')) return next();

    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    this.passwordChangedAt = new Date();
    next();
});

// Auto-lift suspension when suspendedUntil has passed
CorisioAdminSchema.pre('save', function (next) {
    if (
        this.status === 'suspended' &&
        this.suspendedUntil &&
        new Date() > this.suspendedUntil
    ) {
        this.status = 'active';
        this.suspensionReason = undefined;
        this.suspendedAt = undefined;
        this.suspendedUntil = undefined;
        this.suspendedBy = undefined;
    }
    next();
});

// ─────────────────────────────────────────────────────────────────────────────
// Methods
// ─────────────────────────────────────────────────────────────────────────────
CorisioAdminSchema.methods.getFullName = function (): string {
    return `${this.firstName} ${this.lastName}`;
};

CorisioAdminSchema.methods.matchPassword = async function (
    enteredPassword: string
): Promise<boolean> {
    return bcrypt.compare(enteredPassword, this.password);
};

/**
 * Resolves the effective permission set:
 *   rolePermissions + customPermissions − revokedPermissions
 * Deduplication is handled via Set.
 */
CorisioAdminSchema.methods.getResolvedPermissions = function (): CorisioPermission[] {
    const rolePerms: CorisioPermission[] =
        CORISIO_ROLES[this.role as CorisioRoleName]?.permissions ?? [];

    const merged = new Set<CorisioPermission>([
        ...rolePerms,
        ...(this.customPermissions as CorisioPermission[]),
    ]);

    for (const revoked of this.revokedPermissions as CorisioPermission[]) {
        merged.delete(revoked);
    }

    return [...merged];
};

CorisioAdminSchema.methods.getSignedJwtToken = function (): string {
    const secret = process.env.JWT_CORISIO_ADMIN_SECRET || "wewe";
    if (!secret) {
        throw new Error('JWT_CORISIO_ADMIN_SECRET is not defined');
    }
    const token = jwt.sign(
        {
            id: this._id.toString(),
            type: 'corisio_admin',
            role: this.role,
        },
        secret as string,
        { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );

    return token
};

CorisioAdminSchema.methods.getRefreshToken = function (): string {
    const secret = process.env.JWT_CORISIO_ADMIN_REFRESH_SECRET;
    if (!secret) {
        throw new Error('JWT_CORISIO_ADMIN_REFRESH_SECRET is not defined');
    }
    const token = jwt.sign(
        { id: this._id.toString(), type: 'corisio_admin' },
        secret as string,
        { expiresIn: '30d' }
    );
    this.refreshToken = token;
    return token;
};

CorisioAdminSchema.methods.createPasswordResetToken = function (): string {
    const resetToken = crypto.randomBytes(32).toString('hex');
    this.passwordResetToken = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');
    this.passwordResetExpiry = new Date(Date.now() + 30 * 60 * 1000); // 30 min
    return resetToken; // send the raw token via email
};

// ─────────────────────────────────────────────────────────────────────────────
export default mongoose.model<ICorisioAdmin>('CorisioAdmin', CorisioAdminSchema);
