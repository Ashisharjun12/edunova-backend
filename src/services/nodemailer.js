

import nodemailer from 'nodemailer';

export const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: 'your-email@gmail.com',
        pass: 'your-password',
    },
});



/**
 * 
 */
export const sendEmail = async (to, subject, text) => {
    const mailOptions = {
        from: 'your-email@gmail.com',
        to,
        subject,
        text,
    };
};