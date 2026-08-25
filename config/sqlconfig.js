import mysql from 'mysql2/promise';
import dotenv from "dotenv"
dotenv.config({ override: true })


const pool = mysql.createPool({
  host: process.env.HOST,
  user: process.env.USERS,
  port: process.env.PORT ? Number(process.env.PORT) : 3306,
  password: process.env.PASS ?? process.env.PASSWORD ?? "",
  database: process.env.DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  maxIdle: 10, 
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

export default pool