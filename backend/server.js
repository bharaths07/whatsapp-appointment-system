const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const db = require('./db');
const axios = require('axios');
require('dotenv').config();

// Create tables if not exist
db.exec(`
  CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL,
    patient_name TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    token_number INTEGER
  );

  CREATE TABLE IF NOT EXISTS queue_status (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    is_open BOOLEAN DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  INSERT OR IGNORE INTO queue_status (id, is_open) VALUES (1, 0);
`);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Webhook verification (GET /webhook)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === (process.env.VERIFY_TOKEN || 'test_token')) {
      console.log('WEBHOOK_VERIFIED');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

// Webhook for receiving messages (POST /webhook)
app.post('/webhook', async (req, res) => {
  const body = req.body;

  if (body.object === 'whatsapp_business_account') {
    const entry = body.entry[0];
    const changes = entry.changes[0];
    const value = changes.value;

    if (value.messages) {
      const message = value.messages[0];
      const from = message.from;
      const msg_body = message.text.body;

      console.log(`Message from ${from}: ${msg_body}`);

      // Check if message contains "hi" or "appointment" (case-insensitive)
      const text = msg_body.toLowerCase();
      if (text.includes("hi") || text.includes("appointment")) {
        // Check queue status
        const queueStmt = db.prepare('SELECT is_open FROM queue_status WHERE id = 1');
        const queueRow = queueStmt.get();
        const isOpen = queueRow.is_open;

        if (!isOpen) {
          // Queue is closed, send closed message
          await sendWhatsAppMessage(from, 'Appointment queue is currently closed. Please message during OPD hours.');
          console.log('Appointment request denied - queue closed');
        } else {
          // Parse name, assume format "Hi [name]" or just use phone
          const name = msg_body.split(' ')[1] || 'Patient'; // Simple parsing

          // Save to DB
          try {
            const stmt = db.prepare('INSERT INTO appointments (phone, patient_name, status) VALUES (?, ?, ?)');
            stmt.run(from, name, 'pending');
            console.log('Appointment saved');

            // Send "Request Received" message
            await sendWhatsAppMessage(from, 'Your appointment request is received. Please wait for confirmation.');
          } catch (err) {
            console.error('Error saving appointment:', err);
          }
        }
      }
    }
  }

  res.sendStatus(200);
});

// Function to send WhatsApp message
async function sendWhatsAppMessage(to, message) {
  const url = `https://graph.facebook.com/v17.0/${process.env.PHONE_NUMBER_ID}/messages`;
  const data = {
    messaging_product: 'whatsapp',
    to: to,
    type: 'text',
    text: { body: message }
  };

  try {
    await axios.post(url, data, {
      headers: {
        'Authorization': `Bearer ${process.env.META_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    console.log('Message sent');
  } catch (err) {
    console.error('Error sending message:', err);
  }
}

// API to get appointments by status
app.get('/appointments', (req, res) => {
  const { status } = req.query;
  try {
    const stmt = db.prepare('SELECT * FROM appointments WHERE status = ? ORDER BY created_at ASC');
    const rows = stmt.all(status);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// API to approve appointment
app.post('/appointments/:id/approve', async (req, res) => {
  try {
    // Get next token
    const getTokenStmt = db.prepare(`
      SELECT COALESCE(MAX(token_number), 0) + 1 AS next_token
      FROM appointments
      WHERE DATE(created_at) = DATE('now')
    `);
    const tokenRow = getTokenStmt.get();
    const token = tokenRow.next_token;

    // Update appointment
    const updateStmt = db.prepare(`
      UPDATE appointments
      SET status = 'approved', token_number = ?
      WHERE id = ?
    `);
    updateStmt.run(token, req.params.id);

    // Get phone
    const phoneStmt = db.prepare('SELECT phone FROM appointments WHERE id = ?');
    const phoneRow = phoneStmt.get(req.params.id);
    const phone = phoneRow.phone;

    // Send token message
    await sendWhatsAppMessage(phone, `Your appointment is confirmed. Token number: #${token}`);

    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Token assignment failed' });
  }
});

// API to get queue status
app.get('/queue/status', (req, res) => {
  try {
    const stmt = db.prepare('SELECT is_open FROM queue_status WHERE id = 1');
    const row = stmt.get();
    res.json({ isOpen: row.is_open });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// API to open queue
app.post('/queue/open', (req, res) => {
  try {
    const stmt = db.prepare('UPDATE queue_status SET is_open = 1, updated_at = CURRENT_TIMESTAMP WHERE id = 1');
    stmt.run();
    res.json({ message: 'Queue opened successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// API to close queue
app.post('/queue/close', (req, res) => {
  try {
    const stmt = db.prepare('UPDATE queue_status SET is_open = 0, updated_at = CURRENT_TIMESTAMP WHERE id = 1');
    stmt.run();
    res.json({ message: 'Queue closed successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
