const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'zanssxploit@gmail.com',
        pass: 'nsqn sioa rlfk tltz' 
    }
});

const sendEmail = async (to, subject, html) => {
    try {
        await transporter.sendMail({
            from: '"WANZOFC SECURITY" <zanssxploit@gmail.com>',
            to: to,
            subject: subject,
            html: html
        });
        return true;
    } catch (error) {
        console.log(error);
        return false;
    }
};

module.exports = sendEmail;