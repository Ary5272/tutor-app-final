// server.js (Final Version for Cloud Database)
const express = require('express');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 4242;

// Use the DATABASE_URL from the environment variables on Render
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

app.use(express.static('public'));
app.use(express.json());

app.get('/api/available-slots', async (req, res) => {
    const { date } = req.query;
    if (!date) {
        return res.status(400).json({ error: 'A date query parameter is required.' });
    }
    
    // In PostgreSQL, Sunday is 0, Monday is 1, etc.
    const dayOfWeek = new Date(date + 'T00:00:00').getDay();
    const sessionDuration = 60;

    try {
        const availabilityRes = await pool.query("SELECT start_time, end_time FROM availability WHERE day_of_week = $1", [dayOfWeek]);
        const workBlocks = availabilityRes.rows;
        if (!workBlocks.length) {
            return res.json([]);
        }

        const bookingsRes = await pool.query("SELECT session_datetime FROM bookings WHERE session_datetime::date = $1", [date]);
        const bookedSlots = bookingsRes.rows;

        const bookedTimes = bookedSlots.map(slot => new Date(slot.session_datetime).toISOString());
        const availableSlots = [];

        workBlocks.forEach(block => {
            const start = new Date(`${date}T${block.start_time}:00Z`);
            const end = new Date(`${date}T${block.end_time}:00Z`);
            let currentSlot = new Date(start);

            while (currentSlot < end) {
                const slotEndTime = new Date(currentSlot.getTime() + sessionDuration * 60000);
                if (slotEndTime > end) break;
                const slotISO = currentSlot.toISOString();
                if (!bookedTimes.includes(slotISO)) {
                    availableSlots.push(slotISO);
                }
                currentSlot = slotEndTime;
            }
        });
        res.json(availableSlots);

    } catch (err) {
        console.error('Error fetching slots:', err);
        res.status(500).json({ error: 'Failed to retrieve slots.' });
    }
});

app.post('/request-booking', async (req, res) => {
    const { timeSlot, name, email, subjects, price } = req.body;
    if (!timeSlot || !name || !email || !subjects || price === undefined) {
        return res.status(400).json({ error: 'Missing required booking information.' });
    }

    const subjectsString = subjects.join(', ');
    const sql = "INSERT INTO bookings (session_datetime, client_name, client_email, status, subjects, price) VALUES ($1, $2, $3, $4, $5, $6)";
    const params = [timeSlot, name, email, 'pending', subjectsString, price];

    try {
        await pool.query(sql, params);
        res.status(201).json({ success: true });
    } catch (err) {
        console.error("Database error on booking:", err);
        if (err.code === '23505') { // Unique constraint violation
            return res.status(409).json({ error: 'Sorry, this time slot was just booked by someone else.' });
        }
        res.status(500).json({ error: 'Could not process your booking.' });
    }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));