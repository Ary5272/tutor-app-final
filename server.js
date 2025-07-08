// server.js (Final Version with All Tutor Notifications)
const express = require('express');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 4242;

// --- Nodemailer Setup ---
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

// --- Database Setup ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

app.use(express.static('public'));
app.use(express.json());

// GET endpoint to fetch available slots
app.get('/api/available-slots', async (req, res) => {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'A date query parameter is required.' });
    const dayOfWeek = new Date(date + 'T00:00:00').getDay();
    const sessionDuration = 60;
    try {
        const availabilityRes = await pool.query("SELECT start_time, end_time FROM availability WHERE day_of_week = $1", [dayOfWeek]);
        const workBlocks = availabilityRes.rows;
        if (!workBlocks.length) return res.json([]);
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
                if (!bookedTimes.includes(slotISO)) availableSlots.push(slotISO);
                currentSlot = slotEndTime;
            }
        });
        res.json(availableSlots);
    } catch (err) {
        console.error('Error fetching slots:', err);
        res.status(500).json({ error: 'Failed to retrieve slots.' });
    }
});


// POST endpoint to request a booking (UPDATED to Bcc tutor)
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
        
        const mailOptions = {
            from: process.env.SENDER_EMAIL,
            to: email,
            bcc: process.env.SENDER_EMAIL, // **NEW:** Send a copy to yourself
            subject: 'Your Tutoring Session is Booked!',
            html: `<h1>Booking Confirmation</h1><p>Hi ${name},</p><p>Your tutoring session for <strong>${subjectsString}</strong> is confirmed for:</p><p><strong>${new Date(timeSlot).toLocaleString()}</strong></p><p>The meeting location is: [117 Satterfield Circle]</p><p>Total amount due at session: $${price.toFixed(2)}</p><p>Thank you!</p>`
        };
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) console.error("Error sending email:", error);
            else console.log("Confirmation email sent:", info.response);
        });

        res.status(201).json({ success: true });
    } catch (err) {
        console.error("Database error on booking:", err);
        if (err.code === '23505') return res.status(409).json({ error: 'Sorry, this time slot was just booked.' });
        res.status(500).json({ error: 'Could not process your booking.' });
    }
});

// GET endpoint to find bookings by email
app.get('/api/bookings', async (req, res) => {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Email is required.' });
    try {
        const result = await pool.query("SELECT * FROM bookings WHERE client_email = $1 ORDER BY session_datetime ASC", [email]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching bookings by email:', err);
        res.status(500).json({ error: 'Failed to retrieve bookings.' });
    }
});

// DELETE endpoint to cancel a booking
app.delete('/api/cancel-booking', async (req, res) => {
    const { bookingId, email } = req.body;
    if (!bookingId || !email) return res.status(400).json({ error: 'Booking ID and email are required.' });
    try {
        const result = await pool.query("DELETE FROM bookings WHERE id = $1 AND client_email = $2 RETURNING *", [bookingId, email]);
        
        if (result.rowCount === 0) return res.status(404).json({ error: 'Booking not found or email does not match.' });

        const canceledBooking = result.rows[0];
        const mailOptions = {
            from: process.env.SENDER_EMAIL,
            to: email,
            bcc: process.env.SENDER_EMAIL,
            subject: 'Your Tutoring Session Has Been Canceled',
            html: `<h1>Booking Canceled</h1><p>Hi ${canceledBooking.client_name},</p><p>This is a confirmation that your tutoring session for <strong>${new Date(canceledBooking.session_datetime).toLocaleString()}</strong> has been successfully canceled.</p><p>We hope to see you again soon!</p>`
        };
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) console.error("Error sending cancellation email:", error);
            else console.log("Cancellation email sent:", info.response);
        });

        res.status(200).json({ success: true, message: 'Booking canceled successfully.' });
    } catch (err) {
        console.error('Error canceling booking:', err);
        res.status(500).json({ error: 'Failed to cancel booking.' });
    }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));