const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
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
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } 
}));
app.use(flash());
app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  res.locals.error = req.flash('error');
  res.locals.user = req.session.user || null; 
  next();
});
app.use('/', require('./routes/dashboard')); 
app.use('/auth', require('./routes/auth'));
app.use('/smm', require('./routes/smm'));
app.use('/ppob', require('./routes/ppob'));
app.use('/deposit', require('./routes/deposit'));
app.use('/admin', require('./routes/admin'));
app.use('/profile', require('./routes/profile'));
app.use('/news', require('./routes/news'));
app.use('/marketplace', require('./routes/marketplace'));
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server wanzofc shop berjalan di port ${PORT}`);
});