const express = require('express');
const router = express.Router();
const multer = require('multer');
const Product = require('../models/product');
const User = require('../models/user');
const { uploadToCatbox } = require('../utils/catbox');

const upload = multer({ storage: multer.memoryStorage() });

const ensureAuthenticated = (req, res, next) => {
    if (req.session.user) return next();
    res.redirect('/auth/login');
};

const ensureSeller = (req, res, next) => {
    if (req.session.user && (req.session.user.role === 'seller' || req.session.user.role === 'admin')) {
        return next();
    }
    req.flash('error_msg', 'Akses khusus Seller');
    res.redirect('/marketplace');
};

router.get('/', ensureAuthenticated, async (req, res) => {
    try {
        const products = await Product.find().populate('seller', 'fullname username').sort({ createdAt: -1 });
        res.render('marketplace/index', {
            title: 'Marketplace',
            css: 'dashboard.css',
            products,
            user: req.session.user
        });
    } catch (err) {
        console.error(err);
        res.redirect('/dashboard');
    }
});

router.get('/add', ensureAuthenticated, ensureSeller, (req, res) => {
    res.render('marketplace/add', { title: 'Jual Produk', css: 'dashboard.css' });
});

router.post('/add', ensureAuthenticated, ensureSeller, upload.single('image'), async (req, res) => {
    const { name, description, price, category } = req.body;
    try {
        let imageUrl = '';
        if (req.file) {
            imageUrl = await uploadToCatbox(req.file.buffer, req.file.originalname);
        }

        const newProduct = new Product({
            seller: req.session.user.id,
            name, description, price, category,
            image: imageUrl
        });

        await newProduct.save();
        req.flash('success_msg', 'Produk berhasil dijual');
        res.redirect('/marketplace');
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Gagal upload produk');
        res.redirect('/marketplace/add');
    }
});

router.post('/buy/:id', ensureAuthenticated, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        const buyer = await User.findById(req.session.user.id);
        const seller = await User.findById(product.seller);

        if (buyer.balance < product.price) {
            req.flash('error_msg', 'Saldo tidak mencukupi');
            return res.redirect('/marketplace');
        }

        if (buyer.id === seller.id) {
            req.flash('error_msg', 'Tidak bisa membeli produk sendiri');
            return res.redirect('/marketplace');
        }

        buyer.balance -= product.price;
        seller.balance += product.price;
        product.sold += 1;

        await buyer.save();
        await seller.save();
        await product.save();

        req.session.user.balance = buyer.balance;
        req.flash('success_msg', 'Pembelian berhasil! Hubungi penjual untuk proses selanjutnya.');
        res.redirect('/marketplace');

    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Transaksi gagal');
        res.redirect('/marketplace');
    }
});

module.exports = router;