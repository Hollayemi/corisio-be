import nodemailer from 'nodemailer';

interface EmailOptions {
    to: string;
    subject: string;
    html: string;
    text?: string;
}

// Create reusable transporter
const createTransporter = () => {
    if (process.env.NODE_ENV === 'production') {
        // Production email service (e.g., SendGrid, AWS SES)
        return nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD
            }
        });
    } else {
        // Development - use Ethereal email or console
        return nodemailer.createTransport({
            host: 'smtp.ethereal.email',
            port: 587,
            auth: {
                user: process.env.ETHEREAL_USER || 'ethereal.user@ethereal.email',
                pass: process.env.ETHEREAL_PASS || 'ethereal-password'
            }
        });
    }
};

export const sendEmail = async (options: EmailOptions): Promise<void> => {
    const transporter = createTransporter();

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

// Email templates
export const emailTemplates = {
    welcome: (fullName: string, email: string, password: string, roleName: string) => `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
                .content { padding: 20px; background-color: #f9f9f9; }
                .credentials { background-color: #fff; padding: 15px; border-left: 4px solid #4CAF50; margin: 20px 0; }
                .button { display: inline-block; padding: 12px 24px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
                .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Welcome to Go-Kart!</h1>
                </div>
                <div class="content">
                    <h2>Hello ${fullName},</h2>
                    <p>Your account has been successfully created. Here are your login credentials:</p>
                    
                    <div class="credentials">
                        <p><strong>Email:</strong> ${email}</p>
                        <p><strong>Temporary Password:</strong> ${password}</p>
                        <p><strong>Role:</strong> ${roleName}</p>
                    </div>
                    
                    <p><strong>Important:</strong> Please log in and change your password immediately for security reasons.</p>
                    
                    <a href="${process.env.FRONTEND_URL}/login" class="button">Log In Now</a>
                    
                    <p>If you have any questions, please contact your administrator.</p>
                </div>
                <div class="footer">
                    <p>&copy; ${new Date().getFullYear()} Go-Kart. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
    `,

    passwordReset: (fullName: string, temporaryPassword: string) => `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background-color: #FF9800; color: white; padding: 20px; text-align: center; }
                .content { padding: 20px; background-color: #f9f9f9; }
                .password-box { background-color: #fff; padding: 15px; border-left: 4px solid #FF9800; margin: 20px 0; font-size: 18px; font-weight: bold; }
                .button { display: inline-block; padding: 12px 24px; background-color: #FF9800; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
                .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Password Reset</h1>
                </div>
                <div class="content">
                    <h2>Hello ${fullName},</h2>
                    <p>Your password has been reset. Here is your new temporary password:</p>
                    
                    <div class="password-box">
                        ${temporaryPassword}
                    </div>
                    
                    <p><strong>Important:</strong> Please log in and change your password immediately.</p>
                    
                    <a href="${process.env.FRONTEND_URL}/login" class="button">Log In Now</a>
                    
                    <p>If you did not request this password reset, please contact your administrator immediately.</p>
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
                    <p>Your account has been suspended.</p>
                    
                    <div class="reason-box">
                        <p><strong>Reason:</strong> ${reason}</p>
                        ${duration ? `<p><strong>Duration:</strong> ${duration} days</p>` : '<p><strong>Duration:</strong> Indefinite</p>'}
                        ${suspendedUntil ? `<p><strong>Suspended Until:</strong> ${suspendedUntil.toLocaleDateString()}</p>` : ''}
                    </div>
                    
                    <p>If you believe this is an error, please contact your administrator.</p>
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
                    <p>Your account has been permanently disabled.</p>
                    
                    <div class="reason-box">
                        <p><strong>Reason:</strong> ${reason}</p>
                    </div>
                    
                    <p>If you have questions, please contact your administrator.</p>
                </div>
                <div class="footer">
                    <p>&copy; ${new Date().getFullYear()} Go-Kart. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
    `
};