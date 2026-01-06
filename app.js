const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo'); // Tambahan Wajib
const flash = require('connect-flash');
const path = require('path');
const dotenv = require('dotenv');
const connectDB = require('./config/db');

dotenv.config();

connectDB();

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));

// UPDATE DI SINI: Gunakan MongoStore
app.use(session({
  secret: process.env.SESSION_SECRET || 'rahasia_default_aman',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ 
    mongoUrl: process.env.MONGO_URI,
    collectionName: 'sessions', // Nama koleksi di DB
    ttl: 24 * 60 * 60 // Sesi valid 1 hari
  }),
  cookie: { 
    maxAge: 24 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production' // True jika menggunakan HTTPS/Vercel
  }
}));

app.use(flash());

app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  res.locals.error = req.flash('error');
  res.locals.user = req.session.user || null;
  // Perbaiki jalur active class di navbar
  res.locals.title = 'Wanzofc Shop'; 
  next();
});

app.use('/', require('./routes/dashboard'));
app.use('/auth', require('./routes/auth'));
app.use('/smm', require('./routes/smm'));
app.use('/ppob', require('./routes/ppob'));
app.use('/deposit', require('./routes/deposit'));
app.use('/profile', require('./routes/profile'));
app.use('/marketplace', require('./routes/marketplace'));
app.use('/news', require('./routes/news'));
app.use('/admin', require('./routes/admin'));

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server berjalan di port ${PORT}`);
});
