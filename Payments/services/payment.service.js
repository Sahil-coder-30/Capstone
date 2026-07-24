import { sendPaymentNotification } from '../config/mq.js';

/**
 * Send Payment Confirmation Notification (Payment Success)
 * Triggered when Razorpay transaction completes successfully.
 * 
 * @param {Object} params
 * @param {string} params.email - User email address
 * @param {string} params.username - User full name or display username
 * @param {Object} params.transactionDetails - Razorpay transaction response (paymentId, orderId, signature, amount, method, status, etc.)
 */
export const sendPaymentConfirmation = async ({ email, username, transactionDetails }) => {
  if (!email || !username || !transactionDetails) {
    throw new Error('email, username, and transactionDetails are required for payment confirmation');
  }

  const payload = {
    action: 'payment_success',
    email,
    username,
    transactionDetails,
    timestamps: Date.now(),
  };

  await sendPaymentNotification(payload);
  console.log(`[Payment Service] Sent Payment Confirmation notification for ${email}`);
  return payload;
};

/**
 * Send Payment Issue Notification (Payment Failure)
 * Triggered when a payment attempt fails, times out, or encounters a Razorpay error.
 * 
 * @param {Object} params
 * @param {string} params.email - User email address
 * @param {string} params.username - User full name or display username
 * @param {Object} params.transactionDetails - Razorpay response / attempt details
 * @param {string} [params.errorReason] - Detailed error message or reason for failure
 */
export const sendPaymentIssue = async ({ email, username, transactionDetails, errorReason }) => {
  if (!email || !username || !transactionDetails) {
    throw new Error('email, username, and transactionDetails are required for payment issue notification');
  }

  const payload = {
    action: 'payment_failed',
    email,
    username,
    transactionDetails: {
      ...transactionDetails,
      errorReason: errorReason || transactionDetails.errorReason || 'Transaction could not be verified or processed.',
    },
    timestamps: Date.now(),
  };

  await sendPaymentNotification(payload);
  console.log(`[Payment Service] Sent Payment Issue notification for ${email}`);
  return payload;
};

/**
 * Send Payment Cancellation Notification
 * Triggered when user cancels payment on Razorpay checkout modal or session expires.
 * 
 * @param {Object} params
 * @param {string} params.email - User email address
 * @param {string} params.username - User full name or display username
 * @param {Object} params.transactionDetails - Order or attempt details
 * @param {string} [params.cancelReason] - Optional reason for cancellation
 */
export const sendPaymentCancel = async ({ email, username, transactionDetails, cancelReason }) => {
  if (!email || !username || !transactionDetails) {
    throw new Error('email, username, and transactionDetails are required for payment cancel notification');
  }

  const payload = {
    action: 'payment_cancelled',
    email,
    username,
    transactionDetails: {
      ...transactionDetails,
      cancelReason: cancelReason || 'Payment checkout process was dismissed by user.',
    },
    timestamps: Date.now(),
  };

  await sendPaymentNotification(payload);
  console.log(`[Payment Service] Sent Payment Cancel notification for ${email}`);
  return payload;
};

/**
 * Send Payment Receipt & Tax Statement Report Email
 * Generates an official itemized report statement sent to the user on payment completion.
 * 
 * @param {Object} params
 * @param {string} params.email - User email address
 * @param {string} params.username - User full name or display username
 * @param {Object} params.transactionDetails - Razorpay transaction details
 * @param {Array} [params.items] - Optional array of purchased items [{ description, qty, price }]
 * @param {string} [params.invoiceNumber] - Custom invoice or tax receipt number
 */
export const sendPaymentReceiptReport = async ({ email, username, transactionDetails, items = [], invoiceNumber }) => {
  if (!email || !username || !transactionDetails) {
    throw new Error('email, username, and transactionDetails are required for payment receipt report');
  }

  const payload = {
    action: 'payment_report',
    email,
    username,
    transactionDetails,
    items,
    invoiceNumber: invoiceNumber || `INV-${Date.now().toString(36).toUpperCase()}`,
    timestamps: Date.now(),
  };

  await sendPaymentNotification(payload);
  console.log(`[Payment Service] Sent Payment Receipt Report email for ${email}`);
  return payload;
};

/**
 * Generic Payment Event Dispatcher Callback
 * 
 * @param {Object} params
 * @param {string} params.action - Event action: payment_success, payment_failed, payment_cancelled, payment_report
 * @param {string} params.email - Target email
 * @param {string} params.username - User name
 * @param {Object} params.transactionDetails - Razorpay details payload
 */
export const notifyPaymentEvent = async ({ action = 'payment_success', email, username, transactionDetails, items, invoiceNumber }) => {
  switch (action) {
    case 'payment_success':
      return sendPaymentConfirmation({ email, username, transactionDetails });
    case 'payment_failed':
      return sendPaymentIssue({ email, username, transactionDetails });
    case 'payment_cancelled':
      return sendPaymentCancel({ email, username, transactionDetails });
    case 'payment_report':
      return sendPaymentReceiptReport({ email, username, transactionDetails, items, invoiceNumber });
    default:
      return sendPaymentConfirmation({ email, username, transactionDetails });
  }
};
