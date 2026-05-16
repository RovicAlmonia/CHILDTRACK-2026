import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  port:               parseInt(process.env.DB_PORT || '3306'),
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASSWORD || '',
  database:           process.env.DB_NAME     || 'childtrack_db',
  waitForConnections: true,
  connectionLimit:    isProduction ? 20 : 10,
  queueLimit:         0,
  timezone:           '+08:00', // Philippine Time

  // SSL only in production and only when CA cert is provided
  ...(isProduction && process.env.DB_SSL_CA
    ? { ssl: { ca: process.env.DB_SSL_CA, rejectUnauthorized: true } }
    : {}),
});

// Test connection on startup
pool.getConnection()
  .then(conn => {
    console.log(`✅ MySQL connected successfully (${isProduction ? 'production' : 'local'})`);
    conn.release();
  })
  .catch(err => {
    console.error('❌ MySQL connection failed:', err.message);
    process.exit(1);
  });

export default pool;