import nodemailer from 'nodemailer';

interface EmailOptions {
    to: string;
    subject: string;
    html: string;
    text?: string;
}

// Use the same email sending function as staff emails
export const sendEmail = async (options: EmailOptions): Promise<void> => {
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD
        }
    });

    const mailOptions = {
        from: `${process.env.FROM_NAME || 'Go-Kart'} <${process.env.FROM_EMAIL || 'noreply@gokart.ng'}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        
        if (process.env.NODE_ENV !== 'production') {
            console.log('Email sent:', nodemailer.getTestMessageUrl(info));
        }
    } catch (error) {
        console.error('Error sending email:', error);
        throw error;
    }
};

// Driver-specific email templates
export const driverEmailTemplates = {
    passwordSetup: (fullName: string, setupUrl: string) => `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
                .content { padding: 20px; background-color: #f9f9f9; }
                .button { display: inline-block; padding: 12px 24px; background-color: #4CAF50; color: white !important; text-decoration: none; border-radius: 4px; margin: 20px 0; }
                .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
                .warning { background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Welcome to Go-Kart Driver Network!</h1>
                </div>
                <div class="content">
                    <h2>Hello ${fullName},</h2>
                    <p>Congratulations! Your driver account has been created successfully.</p>
                    
                    <p>To get started, you need to set up your password by clicking the button below:</p>
                    
                    <center>
                        <a href="${setupUrl}" class="button">Set Up Password</a>
                    </center>
                    
                    <div class="warning">
                        <strong>⚠️ Important:</strong>
                        <ul>
                            <li>This link will expire in 24 hours</li>
                            <li>For security reasons, don't share this link with anyone</li>
                            <li>After setting your password, your account will be reviewed by our team</li>
                        </ul>
                    </div>
                    
                    <p>Once verified, you'll be able to start accepting deliveries!</p>
                    
                    <p>If you didn't request this account, please ignore this email.</p>
                </div>
                <div class="footer">
                    <p>&copy; ${new Date().getFullYear()} Go-Kart. All rights reserved.</p>
                    <p>If the button doesn't work, copy and paste this link:</p>
                    <p style="word-break: break-all;">${setupUrl}</p>
                </div>
            </div>
        </body>
        </html>
    `,

    passwordSetupResend: (fullName: string, setupUrl: string) => `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background-color: #FF9800; color: white; padding: 20px; text-align: center; }
                .content { padding: 20px; background-color: #f9f9f9; }
                .button { display: inline-block; padding: 12px 24px; background-color: #FF9800; color: white !important; text-decoration: none; border-radius: 4px; margin: 20px 0; }
                .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>New Password Setup Link</h1>
                </div>
                <div class="content">
                    <h2>Hello ${fullName},</h2>
                    <p>We've generated a new password setup link for your driver account.</p>
                    
                    <center>
                        <a href="${setupUrl}" class="button">Set Up Password</a>
                    </center>
                    
                    <p><strong>This link will expire in 24 hours.</strong></p>
                    
                    <p>If you didn't request this, please contact support immediately.</p>
                </div>
                <div class="footer">
                    <p>&copy; ${new Date().getFullYear()} Go-Kart. All rights reserved.</p>
                    <p style="word-break: break-all;">${setupUrl}</p>
                </div>
            </div>
        </body>
        </html>
    `,

    verificationApproved: (fullName: string, loginUrl: string) => `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
                .content { padding: 20px; background-color: #f9f9f9; }
                .success-box { background-color: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0; }
                .button { display: inline-block; padding: 12px 24px; background-color: #4CAF50; color: white !important; text-decoration: none; border-radius: 4px; margin: 20px 0; }
                .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🎉 Congratulations!</h1>
                </div>
                <div class="content">
                    <h2>Hello ${fullName},</h2>
                    
                    <div class="success-box">
                        <strong>✅ Your driver account has been verified!</strong>
                    </div>
                    
                    <p>Great news! Your account has been reviewed and approved by our team.</p>
                    
                    <p>You can now start accepting deliveries and earning with Go-Kart!</p>
                    
                    <h3>Next Steps:</h3>
                    <ol>
                        <li>Download the Go-Kart Driver app (if you haven't already)</li>
                        <li>Log in with your credentials</li>
                        <li>Turn on your availability to start receiving delivery requests</li>
                        <li>Deliver with a smile and earn great ratings!</li>
                    </ol>
                    
                    <center>
                        <a href="${loginUrl}" class="button">Log In to Driver App</a>
                    </center>
                    
                    <p>Welcome to the Go-Kart family! We're excited to have you on board.</p>
                </div>
                <div class="footer">
                    <p>&copy; ${new Date().getFullYear()} Go-Kart. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
    `,

    verificationRejected: (fullName: string, reason: string) => `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background-color: #F44336; color: white; padding: 20px; text-align: center; }
                .content { padding: 20px; background-color: #f9f9f9; }
                .reason-box { background-color: #fff; padding: 15px; border-left: 4px solid #F44336; margin: 20px 0; }
                .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Driver Account Verification Update</h1>
                </div>
                <div class="content">
                    <h2>Hello ${fullName},</h2>
                    
                    <p>Thank you for your interest in becoming a Go-Kart driver.</p>
                    
                    <p>Unfortunately, we were unable to verify your account at this time.</p>
                    
                    <div class="reason-box">
                        <strong>Reason:</strong><br>
                        ${reason}
                    </div>
                    
                    <h3>What you can do:</h3>
                    <ul>
                        <li>Review the rejection reason above</li>
                        <li>Update your information or documents as needed</li>
                        <li>Contact our support team if you have questions</li>
                        <li>Reapply when you've addressed the issues</li>
                    </ul>
                    
                    <p>If you believe this is an error or have questions, please contact our support team at <a href="mailto:support@gokart.ng">support@gokart.ng</a></p>
                </div>
                <div class="footer">
                    <p>&copy; ${new Date().getFullYear()} Go-Kart. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
    `,

    accountSuspended: (fullName: string, reason: string, duration?: number, suspendedUntil?: Date) => `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background-color: #F44336; color: white; padding: 20px; text-align: center; }
                .content { padding: 20px; background-color: #f9f9f9; }
                .reason-box { background-color: #fff; padding: 15px; border-left: 4px solid #F44336; margin: 20px 0; }
                .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Account Suspended</h1>
                </div>
                <div class="content">
                    <h2>Hello ${fullName},</h2>
                    
                    <p>Your driver account has been temporarily suspended.</p>
                    
                    <div class="reason-box">
                        <p><strong>Reason:</strong> ${reason}</p>
                        ${duration ? `<p><strong>Duration:</strong> ${duration} days</p>` : '<p><strong>Duration:</strong> Indefinite</p>'}
                        ${suspendedUntil ? `<p><strong>Suspended Until:</strong> ${suspendedUntil.toLocaleDateString()}</p>` : ''}
                    </div>
                    
                    <p>During this suspension period:</p>
                    <ul>
                        <li>You will not be able to accept new deliveries</li>
                        <li>Your account will not appear in the active drivers list</li>
                        <li>You cannot access the driver app</li>
                    </ul>
                    
                    <p>If you believe this suspension is unfair or have questions, please contact our support team at <a href="mailto:support@gokart.ng">support@gokart.ng</a></p>
                </div>
                <div class="footer">
                    <p>&copy; ${new Date().getFullYear()} Go-Kart. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
    `,

    accountDisabled: (fullName: string, reason: string) => `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background-color: #9E9E9E; color: white; padding: 20px; text-align: center; }
                .content { padding: 20px; background-color: #f9f9f9; }
                .reason-box { background-color: #fff; padding: 15px; border-left: 4px solid #9E9E9E; margin: 20px 0; }
                .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Account Disabled</h1>
                </div>
                <div class="content">
                    <h2>Hello ${fullName},</h2>
                    
                    <p>Your driver account has been permanently disabled.</p>
                    
                    <div class="reason-box">
                        <p><strong>Reason:</strong> ${reason}</p>
                    </div>
                    
                    <p>Your access to the Go-Kart driver platform has been revoked, and you will no longer be able to accept deliveries.</p>
                    
                    <p>If you have questions or concerns, please contact our support team at <a href="mailto:support@gokart.ng">support@gokart.ng</a></p>
                    
                    <p>Thank you for your service with Go-Kart.</p>
                </div>
                <div class="footer">
                    <p>&copy; ${new Date().getFullYear()} Go-Kart. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
    `
};