const express = require('express');
const Razorpay = require('razorpay');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Create Razorpay Order
app.post('/create-order', async (req, res) => {
  const { amount, currency, user_id, user_email } = req.body;
  if (!amount || !currency || !user_id || !user_email) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const options = {
    amount: amount,
    currency: currency,
    receipt: `order_${user_id}_${Date.now()}`,
    notes: { user_id, user_email }
  };
  try {
    const order = await razorpay.orders.create(options);
    res.json({ order_id: order.id, key_id: process.env.RAZORPAY_KEY_ID });
  } catch (err) {
    console.error('[Create Order] Error:', err);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// Verify Payment
app.post('/verify-payment', (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ status: 'failure', message: 'Missing payment details' });
  }

  const generatedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(razorpay_order_id + '|' + razorpay_payment_id)
    .digest('hex');

  if (generatedSignature === razorpay_signature) {
    res.json({ status: 'success', message: 'Payment verified successfully' });
  } else {
    console.error('[Verify Payment] Invalid signature');
    res.status(400).json({ status: 'failure', message: 'Payment verification failed' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});