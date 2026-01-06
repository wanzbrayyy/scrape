const express = require('express');
const router = express.Router();
const multer = require('multer');
const News = require('../models/news');
const { uploadToCatbox } = require('../utils/catbox');

const upload = multer({ storage: multer.memoryStorage() });

const ensureAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') return next();
    res.redirect('/dashboard');
};

router.get('/news', ensureAdmin, async (req, res) => {
    const newsList = await News.find().sort({ createdAt: -1 });
    res.render('admin/news/index', { title: 'Kelola Berita', css: 'dashboard.css', newsList });
});

router.get('/news/add', ensureAdmin, (req, res) => {
    res.render('admin/news/add', { title: 'Tambah Berita', css: 'dashboard.css' });
});

router.post('/news/add', ensureAdmin, upload.single('image'), async (req, res) => {
    const { title, category, type, content } = req.body;
    try {
        let imageUrl = '';
        if (req.file) {
            imageUrl = await uploadToCatbox(req.file.buffer, req.file.originalname);
        }

        const newNews = new News({ 
            title, category, type, content, 
            image: imageUrl,
            author: req.session.user.fullname 
        });
        await newNews.save();
        
        req.flash('success_msg', 'Berita berhasil dipublish!');
        res.redirect('/admin/news');
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Gagal: ' + err.message);
        res.redirect('/admin/news/add');
    }
});

module.exports = router;