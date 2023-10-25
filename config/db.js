const mysql = require('mysql');

//-------------------------------- Database connection
// const dbConfig = {
//     host: 'localhost',
//     user: 'root',
//     password: '',
//     database: 'kijiji_db',
// };

//production env
const dbConfig = {
    host: 'localhost',
    user: 'said',
    password: 'aLOPak_7m@akj',
    database: 'kijiji_db',
  };

const db = mysql.createConnection(dbConfig);

db.connect((err) => {
  if (err) {
    console.error('Error connecting to MySQL:', err);
    return;
  }
  console.log('Connected to MySQL database');
});

module.exports = db;
