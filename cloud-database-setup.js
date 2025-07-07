// cloud-database-setup.js (Simplified for Render)
const { Pool } = require('pg');
require('dotenv').config(); // To read .env file for local testing

// Render provides the DATABASE_URL automatically in production.
// For local testing, you might need a .env file with your own Postgres URL.
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("Database URL not found. Make sure it's set in your environment variables.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

const setupDatabase = async () => {
    console.log("Connecting to cloud database...");
    const client = await pool.connect();
    console.log("Connected successfully!");

    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS availability (
                id SERIAL PRIMARY KEY,
                day_of_week INTEGER NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL
            );
        `);
        console.log('Availability table created or already exists.');

        await client.query(`
            CREATE TABLE IF NOT EXISTS bookings (
                id SERIAL PRIMARY KEY,
                session_datetime TEXT NOT NULL UNIQUE,
                client_name TEXT,
                client_email TEXT,
                status TEXT DEFAULT 'pending',
                subjects TEXT,
                price REAL
            );
        `);
        console.log('Bookings table created or already exists.');

        const mySchedule = [
            { day_of_week: 1, start_time: '09:00', end_time: '12:00' },
            { day_of_week: 1, start_time: '13:00', end_time: '17:00' },
            { day_of_week: 2, start_time: '09:00', end_time: '12:00' },
            { day_of_week: 2, start_time: '13:00', end_time: '17:00' },
            { day_of_week: 3, start_time: '09:00', end_time: '12:00' },
            { day_of_week: 3, start_time: '13:00', end_time: '17:00' },
            { day_of_week: 4, start_time: '09:00', end_time: '12:00' },
            { day_of_week: 4, start_time: '13:00', end_time: '17:00' },
            { day_of_week: 5, start_time: '09:00', end_time: '12:00' },
            { day_of_week: 5, start_time: '13:00', end_time: '17:00' },
        ];

        await client.query('DELETE FROM availability');
        for (const slot of mySchedule) {
            await client.query(
                'INSERT INTO availability (day_of_week, start_time, end_time) VALUES ($1, $2, $3)',
                [slot.day_of_week, slot.start_time, slot.end_time]
            );
        }
        console.log('Weekly schedule has been set.');

    } catch (err) {
        console.error('Error setting up database:', err);
    } finally {
        await client.release();
        console.log("Database setup complete. Connection closed.");
        await pool.end();
    }
};

setupDatabase();