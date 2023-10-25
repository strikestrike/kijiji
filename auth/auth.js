const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { secretKey } = require('../config');

// Registration
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if the email is already taken
    const checkUserQuery = 'SELECT * FROM users WHERE email = ?';
    db.query(checkUserQuery, [email], (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: 'Internal server error' });
      }

      if (results.length > 0) {
        return res.status(400).json({ message: 'Email already exists.' });
      }

      // Hash the password
      const saltRounds = 10;
      bcrypt.hash(password, saltRounds, (hashErr, hashedPassword) => {
        if (hashErr) {
          console.error(hashErr);
          return res.status(500).json({ message: 'Internal server error' });
        }

        // Insert a new user
        const insertUserQuery = 'INSERT INTO users (email, password) VALUES ( ?, ?)';
        db.query(insertUserQuery, [email, hashedPassword], (insertErr) => {
          if (insertErr) {
            console.error(insertErr);
            return res.status(500).json({ message: 'Internal server error' });
          }
          res.status(201).json({ message: 'Registration successful.' });
        });
      });
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Login
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  // Find the user by email
  const findUserQuery = 'SELECT * FROM users WHERE email = ?';
  db.query(findUserQuery, [email], (err, results) => {
    if (err) {
      console.error(err);
      return res.render('au/login',{ message: 'Internal server error' });
    }

    if (results.length === 0) {
      return res.render('au/login',{ message: 'Invalid email or passwords' });
    }

    const user = results[0];

    // Compare the hashed password
    bcrypt.compare(password, user.password, (hashErr, passwordMatch) => {
      if (hashErr) {
        console.error(hashErr);
        return res.render('au/login',{ message: 'Internal server error' });
      }

      if (!passwordMatch) {
        return res.render('au/login',{ message: 'Invalid email or password' });
      }

      // If authentication is successful, generate a JWT token
      const token = jwt.sign({ id: user.id, email: user.email }, secretKey, {
        expiresIn: '240h', // Token expires in 1 hour
      });

      res.cookie('token', token, { httpOnly: true });
      res.redirect('/inbox');

      // res.json({ token });
    });
  });
});

module.exports = router;
