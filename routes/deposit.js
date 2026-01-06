const express = require('express');
const router = express.Router();
const midtransClient = require('midtrans-client');
const User = require('../models/user');
const Deposit = require('../models/deposit');

const snap = new midtransClient.Snap({
    isProduction: true,
    serverKey: 'Mid-server-zvgGUiY7SS-HS_qhWLkqZQuL',
    clientKey: 'Mid-client-IoIOg2RqJNZgKpY6'
});

const ensureAuthenticated = (req, res, next) => {
    if (req.session.user) return next();
    res.redirect('/auth/login');
};

router.get('/', ensureAuthenticated, (req, res) => {
    res.render('deposit/new', { 
        title: 'Deposit Saldo', 
        css: 'dashboard.css',
        clientKey: 'Mid-client-IoIOg2RqJNZgKpY6'
    });
});

router.post('/', ensureAuthenticated, async (req, res) => {
    const { amount } = req.body;
    const user = req.session.user;

    if (amount < 10000) {
        req.flash('error_msg', 'Minimal deposit Rp 10.000');
        return res.redirect('/deposit');
    }

    try {
        const order_id = `DEP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        const parameter = {
            transaction_details: {
                order_id: order_id,
                gross_amount: amount
            },
            customer_details: {
                first_name: user.fullname,
                email: user.email,
                phone: "08123456789" 
            },
            callbacks: {
                finish: "https://wanzofc-shop.com/deposit/history" 
            }
        };

        const transaction = await snap.createTransaction(parameter);
        const snapToken = transaction.token;

        const newDeposit = new Deposit({
            user: user.id,
            order_id: order_id,
            amount: amount,
            snap_token: snapToken,
            status: 'Pending'
        });

        await newDeposit.save();

        res.render('deposit/pay', {
            title: 'Pembayaran Deposit',
            css: 'dashboard.css',
            snapToken: snapToken,
            clientKey: 'Mid-client-IoIOg2RqJNZgKpY6',
            amount: amount,
            order_id: order_id
        });

    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Gagal membuat transaksi');
        res.redirect('/deposit');
    }
});

router.post('/notification', async (req, res) => {
    try {
        const notificationJson = req.body;
        const statusResponse = await snap.transaction.notification(notificationJson);
        
        const orderId = statusResponse.order_id;
        const transactionStatus = statusResponse.transaction_status;
        const fraudStatus = statusResponse.fraud_status;

        const deposit = await Deposit.findOne({ order_id: orderId });
        if (!deposit) return res.status(404).send('Order not found');

        if (deposit.status === 'Success') return res.status(200).send('Already processed');

        if (transactionStatus == 'capture') {
            if (fraudStatus == 'challenge') {
                deposit.status = 'Pending';
            } else if (fraudStatus == 'accept') {
                deposit.status = 'Success';
                await addBalance(deposit.user, deposit.amount);
            }
        } else if (transactionStatus == 'settlement') {
            deposit.status = 'Success';
            await addBalance(deposit.user, deposit.amount);
        } else if (transactionStatus == 'cancel' || transactionStatus == 'deny' || transactionStatus == 'expire') {
            deposit.status = 'Failed';
        } else if (transactionStatus == 'pending') {
            deposit.status = 'Pending';
        }

        deposit.payment_type = statusResponse.payment_type;
        deposit.payment_time = new Date();
        await deposit.save();

        res.status(200).send('OK');

    } catch (err) {
        console.error(err);
        res.status(500).send('Error processing notification');
    }
});

async function addBalance(userId, amount) {
    const user = await User.findById(userId);
    user.balance += amount;
    await user.save();
}

router.get('/history', ensureAuthenticated, async (req, res) => {
    try {
        const deposits = await Deposit.find({ user: req.session.user.id }).sort({ createdAt: -1 });
        res.render('deposit/history', {
            title: 'Riwayat Deposit',
            css: 'dashboard.css',
            deposits: deposits
        });
    } catch (err) {
        console.error(err);
        res.redirect('/dashboard');
    }
});

module.exports = router;
