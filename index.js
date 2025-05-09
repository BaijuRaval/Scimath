const express = require('express');
const Razorpay = require('razorpay');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Check for environment variables
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  console.error('Error: RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET not set in environment variables');
  process.exit(1);
}

// Initialize Razorpay
let razorpay;
try {
  razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
} catch (error) {
  console.error('Error initializing Razorpay:', error);
  process.exit(1);
}

// Create Razorpay Order
app.post('/create-order', async (req, res) => {
  console.log('[Create Order] Request Body:', req.body);
  const { user_id, user_email } = req.body;

  // Set amount and currency server-side
  const amount = 49900; // ₹499 in paisa
  const currency = 'INR';

  // Generate a short receipt (max 40 characters)
  const timestamp = Date.now().toString().slice(-8); // Last 8 digits of timestamp
  const shortUserId = (user_id || 'guest').slice(0, 20); // Truncate user_id to 20 chars
  const receipt = `ord_${timestamp}_${shortUserId}`.slice(0, 40); // Ensure max 40 chars

  const options = {
    amount: amount, // Amount in paisa
    currency: currency,
    receipt: receipt,
    notes: { user_id, user_email },
  };

  try {
    const order = await razorpay.orders.create(options);
    console.log('[Create Order] Order created:', order.id, 'Receipt:', receipt);
    res.json({
      order_id: order.id,
      key_id: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error('[Create Order] Razorpay Error:', err);
    res.status(500).json({ error: 'Failed to create order', details: err.message });
  }
});

// Verify Payment
app.post('/verify-payment', (req, res) => {
  console.log('[Verify Payment] Request Body:', req.body);
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    console.error('[Verify Payment] Missing payment details:', req.body);
    return res.status(400).json({ status: 'failure', message: 'Missing payment details' });
  }

  const generatedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(razorpay_order_id + '|' + razorpay_payment_id)
    .digest('hex');

  if (generatedSignature === razorpay_signature) {
    console.log('[Verify Payment] Signature verified:', razorpay_payment_id);
    res.json({ status: 'success', message: 'Payment verified successfully' });
  } else {
    console.error('[Verify Payment] Invalid signature:', { razorpay_order_id, razorpay_payment_id });
    res.status(400).json({ status: 'failure', message: 'Payment verification failed' });
  }
});

// Check Payment Status
app.post('/check-payment', async (req, res) => {
  console.log('[Check Payment] Request Body:', req.body);
  const { order_id } = req.body;

  if (!order_id) {
    console.error('[Check Payment] Missing order_id:', req.body);
    return res.status(400).json({ status: 'failure', message: 'Missing order_id' });
  }

  try {
    const payments = await razorpay.orders.fetchPayments(order_id);
    console.log('[Check Payment] Payments for order:', order_id, payments);

    if (payments.items && payments.items.length > 0) {
      const successfulPayment = payments.items.find(payment => payment.status === 'captured');
      if (successfulPayment) {
        console.log('[Check Payment] Found successful payment:', successfulPayment.id);
        return res.json({
          status: 'paid',
          payment_id: successfulPayment.id,
          message: 'Payment found and captured'
        });
      }
    }

    console.log('[Check Payment] No successful payment found for order:', order_id);
    return res.json({ status: 'not_paid', message: 'No successful payment found' });
  } catch (error) {
    console.error('[Check Payment] Razorpay Error:', error);
    res.status(500).json({ status: 'error', message: `Failed to check payment: ${error.message}` });
  }
});

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});