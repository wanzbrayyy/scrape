const express = require('express');
const router = express.Router();
const User = require('../models/user'); // Pastikan ini ada
const SmmOrder = require('../models/smmOrder');
const PpobOrder = require('../models/ppobOrder');
const News = require('../models/news');

const ensureAuthenticated = (req, res, next) => {
  if (req.session.user) {
    return next();
  }
  req.flash('error_msg', 'Silakan login terlebih dahulu');
  res.redirect('/auth/login');
};

router.get('/', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('index', { title: 'Home - wanzofc shop', css: 'landing.css' });
});

// --- PERBAIKAN UTAMA ADA DI SINI ---
router.get('/dashboard', ensureAuthenticated, async (req, res) => {
  try {
    // 1. Ambil data User terbaru dari Database berdasarkan ID session
    const user = await User.findById(req.session.user.id);

    // 2. Jika user tidak ditemukan di DB (misal terhapus), logout paksa
    if (!user) {
        req.session.destroy();
        return res.redirect('/auth/login');
    }

    // 3. Update data session agar sinkron (opsional tapi bagus)
    req.session.user.balance = user.balance;
    req.session.user.fullname = user.fullname;
    req.session.user.profile_pic = user.profile_pic;

    const smmCount = await SmmOrder.countDocuments({ user: user._id });
    const ppobCount = await PpobOrder.countDocuments({ user: user._id });
    const newsList = await News.find().sort({ createdAt: -1 }).limit(5);

    res.render('dashboard/index', { 
      title: 'Dashboard - wanzofc shop', 
      css: 'dashboard.css',
      user: user, // 4. Kirim object user terbaru ke view
      stats: { smmCount, ppobCount },
      newsList: newsList 
    });
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
});

router.get('/information', ensureAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.session.user.id); // Ambil user terbaru juga disini
        const newsList = await News.find().sort({ createdAt: -1 });
        
        res.render('dashboard/information', {
            title: 'Pusat Informasi',
            css: 'dashboard.css',
            user: user, // Kirim user
            newsList
        });
    } catch (err) {
        console.error(err);
        res.redirect('/dashboard');
    }
});

module.exports = router;