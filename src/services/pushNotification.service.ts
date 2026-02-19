import admin from 'firebase-admin';

// Initialize Firebase Admin SDK
let firebaseInitialized = false;

export const initializeFirebase = () => {
    if (firebaseInitialized) return;

    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
        
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });

        firebaseInitialized = true;
        console.log('✅ Firebase Admin SDK initialized successfully');
    } catch (error) {
        console.error('❌ Failed to initialize Firebase Admin SDK:', error);
        throw error;
    }
};

// Send notification to multiple devices
export const sendMulticastNotification = async (
    tokens: string[],
    title: string,
    body: string,
    data?: { [key: string]: string },
    image?: string
): Promise<{
    successCount: number;
    failureCount: number;
    failedTokens: string[];
}> => {
    if (!firebaseInitialized) {
        initializeFirebase();
    }

    if (tokens.length === 0) {
        return {
            successCount: 0,
            failureCount: 0,
            failedTokens: []
        };
    }

    try {
        const messages = tokens.map(token => ({
            notification: {
                title,
                body,
                ...(image && { imageUrl: image })
            },
            data: data || {},
            token
        }));

        const results = await Promise.allSettled(
            messages.map(msg => admin.messaging().send(msg))
        );

        const failedTokens: string[] = [];
        let successCount = 0;
        let failureCount = 0;

        results.forEach((result, idx) => {
            if (result.status === 'fulfilled') {
                successCount++;
            } else {
                failureCount++;
                failedTokens.push(tokens[idx]);
            }
        });

        return {
            successCount,
            failureCount,
            failedTokens
        };
    } catch (error) {
        console.error('Error sending multicast notification:', error);
        throw error;
    }
};

// Send notification in batches (FCM limit is 500 tokens per request)
export const sendBatchNotifications = async (
    allTokens: string[],
    title: string,
    body: string,
    data?: { [key: string]: string },
    image?: string
): Promise<{
    totalSuccess: number;
    totalFailure: number;
    allFailedTokens: string[];
}> => {
    const BATCH_SIZE = 500;
    const batches: string[][] = [];

    // Split tokens into batches
    for (let i = 0; i < allTokens.length; i += BATCH_SIZE) {
        batches.push(allTokens.slice(i, i + BATCH_SIZE));
    }

    let totalSuccess = 0;
    let totalFailure = 0;
    const allFailedTokens: string[] = [];

    // Send each batch
    for (const batch of batches) {
        try {
            const result = await sendMulticastNotification(batch, title, body, data, image);
            totalSuccess += result.successCount;
            totalFailure += result.failureCount;
            allFailedTokens.push(...result.failedTokens);
        } catch (error) {
            console.error('Batch send failed:', error);
            totalFailure += batch.length;
            allFailedTokens.push(...batch);
        }
    }

    return {
        totalSuccess,
        totalFailure,
        allFailedTokens
    };
};

// Send to single token (for testing)
export const sendToToken = async (
    token: string,
    title: string,
    body: string,
    data?: { [key: string]: string },
    image?: string
): Promise<boolean> => {
    if (!firebaseInitialized) {
        initializeFirebase();
    }

    try {
        const message: admin.messaging.Message = {
            notification: {
                title,
                body,
                ...(image && { imageUrl: image })
            },
            data: data || {},
            token
        };

        await admin.messaging().send(message);
        return true;
    } catch (error) {
        console.error('Error sending notification to token:', error);
        return false;
    }
};

// Clean up invalid tokens from database
export const cleanupInvalidTokens = async (invalidTokens: string[]) => {
    // This will be implemented in the User/Driver models
    // to remove invalid FCM tokens
    console.log(`Cleaning up ${invalidTokens.length} invalid tokens`);
    return invalidTokens;
};

export default {
    initializeFirebase,
    sendMulticastNotification,
    sendBatchNotifications,
    sendToToken,
    cleanupInvalidTokens
};
